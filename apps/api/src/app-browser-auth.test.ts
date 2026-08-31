import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  AccessControlService,
  ApplicationError,
  StoryApplication,
  createBaselineAccessState,
  type AccessState,
  type EffectiveAccess,
  type PlatformCredentialSummary,
  type ProductActivityRecord,
  type ProfileAuthentication,
  type SessionRecord,
  type StoryRepository,
} from "@storyteller/application";
import { getMaterialPresentation, materialStorageKeys, type PlatformCredential, type PlatformProvider, type Profile, type ProfileUpdate, type SceneMaterial, type Story } from "@storyteller/domain";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue } from "@storyteller/render-queue";
import { probeMedia, renderVideo, SpawnMediaProcessRunner } from "@storyteller/renderer";
import { Readable } from "node:stream";
import type { LightMyRequestResponse } from "fastify";
import type { OpenAPIV3 } from "openapi-types";
import { sceneRenderFileType, sceneRenderSlot, sceneRenderStorageKey } from "@storyteller/render-queue";
import type { StoryTimelineResponse } from "@storyteller/schemas";
import sharp from "sharp";
import { normalizeStoredStory } from "./database.js";
import { buildApi } from "./server.js";
import { detectMediaMetadata, MediaStorage } from "./media-storage.js";
import { LocalObjectStorage, S3ObjectStorage } from "./object-storage.js";
import { accessPolicyForRoute } from "./access-control.js";
import { buildSceneRenderInput } from "./scene-render-input.js";
import { MemoryRepository, cookieHeader, mergeCookieHeader, responseCookies } from "./app-test-support.js";

process.env.NODE_ENV = "test";

test("browser auth rotates legacy bearer sessions and enforces cookie, Origin, and CSRF together", async (context) => {
  const previousSecure = process.env.SESSION_COOKIE_SECURE;
  process.env.NODE_ENV = "test";
  process.env.SESSION_COOKIE_SECURE = "true";
  context.after(() => {
    if (previousSecure === undefined) delete process.env.SESSION_COOKIE_SECURE;
    else process.env.SESSION_COOKIE_SECURE = previousSecure;
  });
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const api = await buildApi(application);
  context.after(() => api.close());
  const origin = "http://localhost:3000";

  const signIn = await api.inject({
    method: "POST", url: "/auth/browser/sign-in", headers: { origin },
    payload: { name: "Browser", email: "browser@example.com", password: "long-test-password", language: "ru" },
  });
  assert.equal(signIn.statusCode, 200, signIn.body);
  const setCookies = responseCookies(signIn);
  assert.ok(setCookies.some((value) => value.startsWith("__Host-storyteller-session=")
    && value.includes("HttpOnly") && value.includes("Secure") && value.includes("SameSite=Strict") && value.includes("Path=/")));
  assert.ok(setCookies.every((value) => !value.includes("Domain=")));
  const browserCookie = cookieHeader(setCookies);
  const csrfToken = signIn.json<{ csrfToken: string }>().csrfToken;
  assert.equal((await api.inject({ method: "GET", url: "/auth/browser/session", headers: { cookie: browserCookie } })).statusCode, 200);

  assert.equal((await api.inject({
    method: "PATCH", url: "/profile", headers: { cookie: browserCookie, origin }, payload: { language: "en" },
  })).statusCode, 403, "a cookie-authenticated mutation requires CSRF");
  assert.equal((await api.inject({
    method: "PATCH", url: "/profile", headers: { cookie: browserCookie, origin: "https://evil.example", "x-csrf-token": csrfToken }, payload: { language: "en" },
  })).statusCode, 403, "the exact browser origin is required");
  assert.equal((await api.inject({
    method: "PATCH", url: "/profile", headers: { cookie: browserCookie, origin, "x-csrf-token": csrfToken }, payload: { language: "en" },
  })).statusCode, 200);

  const legacy = await application.login({ email: "browser@example.com", password: "long-test-password" });
  assert.equal((await api.inject({
    method: "GET", url: "/profile", headers: { cookie: browserCookie, authorization: `Bearer ${legacy.accessToken}` },
  })).json<{ code: string }>().code, "ambiguous_authentication");
  const exchange = await api.inject({
    method: "POST", url: "/auth/browser/exchange", headers: {
      origin,
      cookie: browserCookie,
      authorization: `Bearer ${legacy.accessToken}`,
    },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  assert.equal((await api.inject({ method: "GET", url: "/profile", headers: { authorization: `Bearer ${legacy.accessToken}` } })).statusCode, 401,
    "exchange revokes the legacy session");

  const exchangedCookies = responseCookies(exchange);
  const exchangedCookie = mergeCookieHeader(browserCookie, exchangedCookies);
  const exchangedCsrf = exchange.json<{ csrfToken: string }>().csrfToken;
  assert.equal((await api.inject({
    method: "POST", url: "/auth/browser/logout", headers: { cookie: exchangedCookie, origin, "x-csrf-token": exchangedCsrf },
  })).statusCode, 204);
  assert.equal((await api.inject({ method: "GET", url: "/auth/browser/session", headers: { cookie: exchangedCookie } })).statusCode, 401);

  const forbiddenCors = await api.inject({ method: "OPTIONS", url: "/profile", headers: {
    origin: "https://evil.example", "access-control-request-method": "GET",
  } });
  assert.equal(forbiddenCors.headers["access-control-allow-origin"], undefined);
});

test("cookie mutations await asynchronous CSRF validation", async (context) => {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const api = await buildApi(application);
  context.after(() => api.close());
  const origin = "http://localhost:3000";
  const signIn = await api.inject({
    method: "POST", url: "/auth/browser/sign-in", headers: { origin },
    payload: { name: "Async CSRF", email: "async-csrf@example.com", password: "long-test-password", language: "ru" },
  });
  assert.equal(signIn.statusCode, 200, signIn.body);
  const browserCookie = cookieHeader(responseCookies(signIn));
  const csrfToken = signIn.json<{ csrfToken: string }>().csrfToken;
  const csrfProtection = api.csrfProtection.bind(api);
  api.csrfProtection = ((request, reply, done) => new Promise<void>((resolve) => {
    setTimeout(() => {
      csrfProtection(request, reply, done);
      resolve();
    }, 5);
  })) as typeof api.csrfProtection;

  const response = await api.inject({
    method: "PATCH", url: "/profile", headers: { cookie: browserCookie, origin }, payload: { language: "en" },
  });
  assert.equal(response.statusCode, 403, response.body);
  assert.equal(repository.profiles.get(signIn.json<{ profile: Profile }>().profile.id)?.language, "ru");
  const accepted = await api.inject({
    method: "PATCH", url: "/profile",
    headers: { cookie: browserCookie, origin, "x-csrf-token": csrfToken }, payload: { language: "en" },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(repository.profiles.get(signIn.json<{ profile: Profile }>().profile.id)?.language, "en");
});
