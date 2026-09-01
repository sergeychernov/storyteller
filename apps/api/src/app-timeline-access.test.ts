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
import { MemoryRepository, multipartFile, renderFixture, sceneDeletionFixture } from "./app-test-support.js";

process.env.NODE_ENV = "test";

test("moving uploaded materials preserves content after source deletion and invalidates only affected render inputs", async (context) => {
  const { api, application, repository, storyId, profileId, headers, sceneId, otherSceneId } = await renderFixture(context);
  const renderUrl = (id: string) => `/stories/${storyId}/scenes/${id}/renders`;
  for (const id of [sceneId, otherSceneId]) assert.equal((await api.inject({ method: "POST", url: renderUrl(id), headers })).statusCode, 202);
  let story = await application.getStory(profileId, storyId);
  const reordered = await api.inject({ method: "PUT", url: `/stories/${storyId}/scene-order`, headers,
    payload: { sceneIds: [otherSceneId, sceneId], expectedRevision: story.revision } });
  assert.equal(reordered.statusCode, 200, reordered.body);
  story = reordered.json<Story>();
  for (const id of [sceneId, otherSceneId]) {
    assert.equal((await api.inject({ method: "GET", url: renderUrl(id), headers })).json<{ current: boolean }[]>()[0]!.current, true);
  }
  const material = story.scenes.find(({ id }) => id === sceneId)!.materials[0]!;
  const contentUrl = `/stories/${storyId}/materials/${material.id}/content`;
  const bytes = (await api.inject({ method: "GET", url: contentUrl, headers })).rawPayload;
  const response = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/materials/move`, headers,
    payload: { materialIds: [material.id], targetSceneId: otherSceneId, targetIndex: 0, expectedRevision: story.revision } });
  assert.equal(response.statusCode, 200, response.body);
  const moved = response.json<Story>();
  assert.equal(moved.revision, story.revision + 1);
  assert.deepEqual(moved.scenes.find(({ id }) => id === sceneId)!.materials, []);
  assert.deepEqual(moved.scenes.find(({ id }) => id === otherSceneId)!.materials[0], material);
  for (const id of [sceneId, otherSceneId]) {
    assert.equal((await api.inject({ method: "GET", url: renderUrl(id), headers })).json<{ current: boolean }[]>()[0]!.current, false);
  }
  assert.deepEqual(repository.deletedSceneStorageKeys, []);
  assert.equal((await api.inject({ method: "DELETE", url: `/stories/${storyId}/scenes/${sceneId}`, headers,
    payload: { expectedRevision: moved.revision } })).statusCode, 200);
  assert.deepEqual(repository.deletedSceneStorageKeys, []);
  const retained = await api.inject({ method: "GET", url: contentUrl, headers });
  assert.equal(retained.statusCode, 200);
  assert.deepEqual(retained.rawPayload, bytes);
});

test("timeline endpoints validate access, complete orders and batch transfer inputs without partial changes", async (context) => {
  const { api, application, repository, story: empty, headers } = await sceneDeletionFixture(context, 2);
  const [source, target] = empty.scenes;
  const story = await application.addSceneMaterial(empty.profileId, empty.id, source!.id, {
    kind: "image", name: "photo.png", storageKey: "photo.png", mimeType: "image/png", orientation: "portrait", width: 100, height: 200, sizeBytes: 100,
  });
  const materialId = story.scenes[0]!.materials[0]!.id;
  const orderUrl = `/stories/${story.id}/scene-order`;
  const moveUrl = `/stories/${story.id}/scenes/${source!.id}/materials/move`;
  const order = { sceneIds: [target!.id, source!.id], expectedRevision: story.revision };
  const move = { materialIds: [materialId], targetSceneId: target!.id, targetIndex: 0, expectedRevision: story.revision };
  const requests = [{ method: "GET" as const, url: `/stories/${story.id}/timeline` },
    { method: "PUT" as const, url: orderUrl, payload: order }, { method: "POST" as const, url: moveUrl, payload: move }];
  const other = await application.register({ name: "Other", email: "timeline-other@example.com", password: "long-test-password" });
  for (const request of requests) {
    assert.equal((await api.inject(request)).statusCode, 401);
    assert.equal((await api.inject({ ...request, headers: { authorization: "Bearer invalid" } })).statusCode, 401);
    assert.equal((await api.inject({ ...request, headers: { authorization: `Bearer ${other.accessToken}` } })).statusCode, 404);
    assert.equal((await api.inject({ ...request, url: request.url.replace(story.id, randomUUID()), headers })).statusCode, 404);
  }
  for (const sceneIds of [[], [source!.id], [source!.id, source!.id], [source!.id, randomUUID()]]) {
    assert.equal((await api.inject({ method: "PUT", url: orderUrl, headers, payload: { ...order, sceneIds } })).statusCode, 422);
  }
  for (const payload of [{ sceneIds: order.sceneIds }, { ...order, sceneIds: ["bad"] }, { ...order, expectedRevision: 0 }, { ...order, typo: true }]) {
    assert.equal((await api.inject({ method: "PUT", url: orderUrl, headers, payload })).statusCode, 400);
  }
  for (const payload of [{ ...move, materialIds: [] }, { ...move, expectedRevision: undefined }, { ...move, targetIndex: -1 },
    { ...move, targetIndex: 0.5 }, { ...move, unexpected: true }]) {
    assert.equal((await api.inject({ method: "POST", url: moveUrl, headers, payload })).statusCode, 400);
  }
  for (const payload of [{ ...move, materialIds: [materialId, materialId] }, { ...move, targetIndex: 1 }, { ...move, targetSceneId: source!.id }]) {
    const invalid = await api.inject({ method: "POST", url: moveUrl, headers, payload });
    assert.equal(invalid.statusCode, 422, invalid.body);
    assert.equal(invalid.json<{ code: string }>().code, "invalid_timeline_edit");
  }
  const otherStory = await application.createStory(story.profileId, { title: "Other story" });
  const foreignScene = (await application.createScene(story.profileId, otherStory.id)).scenes[0]!;
  for (const payload of [{ ...move, materialIds: [materialId, randomUUID()] }, { ...move, targetSceneId: randomUUID() }, { ...move, targetSceneId: foreignScene.id }]) {
    assert.equal((await api.inject({ method: "POST", url: moveUrl, headers, payload })).statusCode, 404);
  }
  for (const request of requests.slice(1)) {
    const stale = await api.inject({ ...request, headers, payload: { ...request.payload, expectedRevision: story.revision - 1 } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json<{ code: string }>().code, "story_revision_conflict");
  }
  assert.deepEqual(repository.stories.get(story.id), story);
  for (const status of ["rendering", "publishing", "published"] as const) {
    const locked = { ...story, status };
    repository.stories.set(story.id, locked);
    for (const request of requests.slice(1)) {
      const response = await api.inject({ ...request, headers });
      assert.equal(response.statusCode, 409);
      assert.equal(response.json<{ code: string }>().code, "story_not_editable");
    }
    assert.deepEqual(repository.stories.get(story.id), locked);
  }
  assert.deepEqual(repository.deletedSceneStorageKeys, []);
});

test("timeline compare-and-swap rejects concurrent saves without overwriting or moving files", async (context) => {
  const { api, repository, application, story: initial, headers } = await sceneDeletionFixture(context, 2);
  const story = await application.addSceneMaterial(initial.profileId, initial.id, initial.scenes[0]!.id, {
    kind: "image", name: "photo.png", storageKey: "photo.png", mimeType: "image/png", orientation: "portrait", width: 100, height: 200, sizeBytes: 100,
  });
  const concurrent = { ...story, revision: story.revision + 1 };
  const persist = repository.updateStory.bind(repository);
  repository.updateStory = async (changed) => { repository.stories.set(story.id, concurrent); await persist(changed); };
  for (const request of [
    { method: "PUT" as const, url: `/stories/${story.id}/scene-order`, payload: { sceneIds: story.scenes.map(({ id }) => id).reverse(), expectedRevision: story.revision } },
    { method: "POST" as const, url: `/stories/${story.id}/scenes/${story.scenes[0]!.id}/materials/move`, payload: {
      materialIds: [story.scenes[0]!.materials[0]!.id], targetSceneId: story.scenes[1]!.id, targetIndex: 0, expectedRevision: story.revision,
    } },
  ]) {
    repository.stories.set(story.id, story);
    const response = await api.inject({ ...request, headers });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<{ code: string }>().code, "story_revision_conflict");
    assert.deepEqual(repository.stories.get(story.id), concurrent);
  }
  assert.deepEqual(repository.deletedSceneStorageKeys, []);
});

test("OpenAPI exposes timeline contracts with required revision guards and documented errors", async (context) => {
  const { api } = await sceneDeletionFixture(context, 0);
  await api.ready();
  const document = api.swagger() as OpenAPIV3.Document;
  const timelineOperation = document.paths["/stories/{storyId}/timeline"]?.get;
  assert.equal(timelineOperation?.operationId, "getStoryTimeline");
  const timelineContract = JSON.stringify(timelineOperation?.responses[200]);
  for (const requiredField of ["totalDurationSeconds", "startSeconds", "endSeconds", "durationSeconds", "empty_scene", "within_limit", "exceeded"]) {
    assert.match(timelineContract, new RegExp(requiredField));
  }
  for (const removedField of ["knownDurationSeconds", "unknown_video_duration", "isLowerBound", '"unknown"']) {
    assert.doesNotMatch(timelineContract, new RegExp(removedField));
  }
  for (const operation of [document.paths["/stories/{storyId}/scene-order"]?.put,
    document.paths["/stories/{storyId}/scenes/{sceneId}/materials/move"]?.post]) {
    assert.ok(operation?.requestBody && "content" in operation.requestBody);
    assert.equal(operation.requestBody.required, true);
    const schema = operation.requestBody.content["application/json"]?.schema;
    assert.ok(schema && "required" in schema && schema.required?.includes("expectedRevision"));
    assert.deepEqual(Object.keys(operation.responses).sort(), ["200", "400", "401", "403", "404", "409", "422"]);
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
  }
});

test("access control is deny-by-default, explains overrides and preserves resource ownership", async (context) => {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const states = new Map<string, AccessState>();
  const accessControl = new AccessControlService({
    loadAccessState: async (requestedProfileId) => states.get(requestedProfileId) ?? {
      profileId: requestedProfileId,
      memberships: [],
      roleAssignments: [],
      capabilityAssignments: [],
      limitAssignments: [],
      operationalSwitches: [],
    },
  }, () => new Date("2026-08-29T12:00:00.000Z"));
  const api = await buildApi(application, { accessControl });
  context.after(() => api.close());
  const user = await application.register({ name: "Denied", email: "denied@example.com", password: "long-test-password" });
  const headers = { authorization: `Bearer ${user.accessToken}` };

  assert.equal((await api.inject({ method: "GET", url: "/profile", headers })).statusCode, 200);
  const deniedAccessResponse = await api.inject({ method: "GET", url: "/access/effective", headers });
  assert.equal(deniedAccessResponse.statusCode, 200);
  assert.equal(deniedAccessResponse.headers["cache-control"], "private, no-store");
  assert.equal(deniedAccessResponse.json<EffectiveAccess>().capabilities.find(({ code }) => code === "studio.access")?.allowed, false);
  const deniedList = await api.inject({ method: "GET", url: "/stories", headers });
  assert.equal(deniedList.statusCode, 403);
  assert.equal(deniedList.json<{ code: string }>().code, "access_denied");

  states.set(user.profile.id, {
    ...createBaselineAccessState(user.profile.id),
    capabilityAssignments: [{
      subject: { kind: "profile", key: user.profile.id },
      capabilityCode: "story.create",
      effect: "deny",
      reason: "fixture",
    }],
  });
  assert.equal((await api.inject({ method: "GET", url: "/stories", headers })).statusCode, 200);
  const deniedCreate = await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "No" } });
  assert.equal(deniedCreate.statusCode, 403);
  const explained = (await api.inject({ method: "GET", url: "/access/effective", headers })).json<EffectiveAccess>();
  assert.deepEqual(explained.capabilities.find(({ code }) => code === "story.create")?.sources.map(({ kind, decisive }) => ({ kind, decisive })), [
    { kind: "role", decisive: false },
    { kind: "user_override", decisive: true },
  ]);

  const owner = await application.register({ name: "Owner", email: "owner@example.com", password: "long-test-password" });
  states.set(owner.profile.id, createBaselineAccessState(owner.profile.id));
  const ownerStory = await application.createStory(owner.profile.id, { title: "Private" });
  states.set(user.profile.id, createBaselineAccessState(user.profile.id));
  assert.equal((await api.inject({ method: "GET", url: `/stories/${ownerStory.id}`, headers })).statusCode, 404);
});

test("every bearer-protected API route has an explicit access policy", async (context) => {
  const { api } = await sceneDeletionFixture(context, 0);
  await api.ready();
  const document = api.swagger() as OpenAPIV3.Document;
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = pathItem?.[method];
      if (!operation?.security?.length) continue;
      const routeUrl = path.replaceAll(/\{([^}]+)\}/g, ":$1");
      const policy = accessPolicyForRoute(method.toUpperCase(), routeUrl);
      assert.ok(policy, `${method.toUpperCase()} ${path} has no access policy`);
      if (policy !== "authenticated") assert.ok(operation.responses[403], `${method.toUpperCase()} ${path} does not document 403`);
    }
  }
});
