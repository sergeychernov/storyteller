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
import { MemoryRenderQueue, MemoryRepository, multipartFile } from "./app-test-support.js";

process.env.NODE_ENV = "test";

test("protects a profile, uploads media and stores its stories", async (context) => {
  process.env.NODE_ENV = "test";
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-media-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const repository = new MemoryRepository();
  const objectStorage = new LocalObjectStorage(mediaRoot);
  const renderQueue = new MemoryRenderQueue();
  const api = await buildApi(new StoryApplication(repository), {
    mediaStorage: new MediaStorage(objectStorage), objectStorage, renderQueue,
  });
  assert.equal((await api.inject({ method: "GET", url: "/profile" })).statusCode, 401);
  const reorderPreflight = await api.inject({
    method: "OPTIONS", url: "/stories/00000000-0000-4000-8000-000000000001/scenes/00000000-0000-4000-8000-000000000002/material-order",
    headers: {
      origin: "http://localhost:3000", "access-control-request-method": "PUT",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  assert.equal(reorderPreflight.statusCode, 204);
  assert.match(reorderPreflight.headers["access-control-allow-methods"] ?? "", /\bPUT\b/);

  const nameRequest = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { email: "sergej@example.com", password: "long-test-password" },
  });
  assert.equal(nameRequest.statusCode, 422);
  assert.equal(nameRequest.json<{ code: string }>().code, "profile_name_required");
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Sergej", email: "sergej@example.com", password: "long-test-password", language: "es" },
  });
  assert.equal(registration.statusCode, 200);
  const auth = registration.json<{ accessToken: string; accountCreated: boolean; profile: Profile }>();
  assert.equal(auth.accountCreated, true);
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  assert.deepEqual((await api.inject({ method: "GET", url: "/profile", headers })).json<Profile>(), {
    id: auth.profile.id, name: "Sergej", email: "sergej@example.com", language: "es",
  });
  const updatedProfile = await api.inject({ method: "PATCH", url: "/profile", headers, payload: { language: "ru" } });
  assert.equal(updatedProfile.statusCode, 200, updatedProfile.body);
  assert.equal(updatedProfile.json<Profile>().language, "ru");
  assert.equal((await api.inject({ method: "PATCH", url: "/profile", headers, payload: {} })).statusCode, 400);
  assert.equal((await api.inject({ method: "PATCH", url: "/profile", headers, payload: { language: "unsupported" } })).statusCode, 400);

  const repeatedSignIn = await api.inject({
    method: "POST", url: "/auth/sign-in",
    payload: { name: "Ignored retry name", email: "sergej@example.com", password: "long-test-password", language: "en" },
  });
  assert.equal(repeatedSignIn.statusCode, 200);
  assert.equal(repeatedSignIn.json<{ accountCreated: boolean; profile: Profile }>().accountCreated, false);
  assert.equal(repeatedSignIn.json<{ accountCreated: boolean; profile: Profile }>().profile.name, "Sergej");
  assert.equal(repeatedSignIn.json<{ accountCreated: boolean; profile: Profile }>().profile.language, "ru");

  const storyResponse = await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "First story" } });
  assert.equal(storyResponse.statusCode, 201);
  const story = storyResponse.json<{ id: string; profileId: string; sceneCount: number }>();
  assert.equal(story.profileId, auth.profile.id);
  assert.equal(story.sceneCount, 0);
  assert.equal((await api.inject({ method: "GET", url: "/stories", headers })).json<unknown[]>().length, 1);
  assert.equal((await api.inject({ method: "GET", url: `/stories/${story.id}`, headers })).statusCode, 200);
  const withScene = await api.inject({ method: "POST", url: `/stories/${story.id}/scenes`, headers });
  assert.equal(withScene.statusCode, 201);
  const sceneId = withScene.json<{ scenes: { id: string }[] }>().scenes[0]!.id;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const multipart = multipartFile("portrait.png", "image/png", png);
  const withPhoto = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/materials`,
    payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType },
  });
  assert.equal(withPhoto.statusCode, 201);
  const uploaded = withPhoto.json<{ scenes: { materials: { id: string; name: string; orientation: string; storageKey: string; width: number; height: number }[] }[] }>().scenes[0]!.materials[0]!;
  assert.equal(uploaded.name, "portrait.png");
  assert.equal(uploaded.orientation, "landscape");
  assert.equal(uploaded.width, 1);
  assert.equal(uploaded.height, 1);
  assert.deepEqual(repository.activities, [{
    profileId: auth.profile.id,
    code: "material.uploaded",
    dedupeKey: `material.uploaded:${uploaded.id}`,
  }]);
  const content = await api.inject({ method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/content`, headers });
  assert.equal(content.statusCode, 200);
  assert.equal(content.headers["cache-control"], "private, no-store");
  assert.deepEqual(content.rawPayload, png);
  const contentAccess = await api.inject({
    method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/content-access`, headers,
  });
  assert.equal(contentAccess.statusCode, 200);
  assert.equal(contentAccess.headers["cache-control"], "private, no-store");
  assert.deepEqual(contentAccess.json(), { url: null });
  const firstEdit = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
    payload: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  assert.equal(firstEdit.statusCode, 200);
  const firstEditedMaterial = firstEdit.json<{
    scenes: { materials: { storageKey: string; width: number; height: number; edit: { rotation: number; result: { storageKey: string } } }[] }[];
  }>().scenes[0]!.materials[0]!;
  assert.equal(firstEditedMaterial.storageKey, uploaded.storageKey);
  assert.equal(firstEditedMaterial.width, uploaded.width);
  assert.equal(firstEditedMaterial.height, uploaded.height);
  assert.equal(firstEditedMaterial.edit.rotation, 90);
  assert.notEqual(firstEditedMaterial.edit.result.storageKey, uploaded.storageKey);
  await access(join(mediaRoot, uploaded.storageKey));
  await access(join(mediaRoot, firstEditedMaterial.edit.result.storageKey));
  const sourceContent = await api.inject({ method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/source-content`, headers });
  assert.deepEqual(sourceContent.rawPayload, png);
  const secondEdit = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
    payload: { rotation: 180, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  const latestEditStorageKey = secondEdit.json<{
    scenes: { materials: { edit: { result: { storageKey: string } } }[] }[];
  }>().scenes[0]!.materials[0]!.edit.result.storageKey;
  assert.notEqual(latestEditStorageKey, firstEditedMaterial.edit.result.storageKey);
  await assert.rejects(access(join(mediaRoot, firstEditedMaterial.edit.result.storageKey)), { code: "ENOENT" });
  await access(join(mediaRoot, uploaded.storageKey));
  await access(join(mediaRoot, latestEditStorageKey));
  const configured = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}`, headers,
    payload: { durationSeconds: 8, layoutId: "full-frame", motion: "pan-left", focusPoint: { x: 0.2, y: 0.65 } },
  });
  const configuredScene = configured.json<{
    scenes: { durationSeconds: number; layoutId: string; motion: string; focusPoint: { x: number; y: number } }[];
  }>().scenes[0]!;
  assert.equal(configuredScene.durationSeconds, 8);
  assert.equal(configuredScene.motion, "pan-left");
  assert.deepEqual(configuredScene.focusPoint, { x: 0.2, y: 0.65 });
  const firstRender = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/renders`, headers,
  });
  const cachedRender = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/renders`, headers,
  });
  assert.equal(firstRender.statusCode, 202, firstRender.body);
  assert.equal(cachedRender.json<{ id: string }>().id, firstRender.json<{ id: string }>().id);
  assert.equal(renderQueue.jobs.size, 1);
  const secondMultipart = multipartFile("second.png", "image/png", png);
  const withSecondPhoto = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/materials`,
    payload: secondMultipart.body, headers: { ...headers, "content-type": secondMultipart.contentType },
  });
  const collageScene = withSecondPhoto.json<Story>().scenes[0]!;
  assert.equal(collageScene.rendererId, "collage");
  assert.deepEqual(collageScene.collage?.frame, { width: 12, color: "#FFFFFF", shape: "straight" });
  assert.equal("overlapRatio" in collageScene.collage!, false);
  assert.equal(collageScene.collage?.entryDurationSeconds, 4);
  assert.equal(collageScene.collage?.straightCards, false);
  assert.deepEqual(collageScene.collage?.cardAngles.map(({ materialId }) => materialId),
    collageScene.materials.map(({ id }) => id));
  assert.ok(collageScene.collage!.cardAngles.every(({ angleDegrees }) => Math.abs(angleDegrees) >= 2
    && Math.abs(angleDegrees) <= 8));
  assert.deepEqual(collageScene.collage?.cardOffsets, collageScene.materials.map(({ id }) => ({ materialId: id, offsetY: 0 })),
    "the scene debug JSON must expose the server-owned offset of every card");
  const collageConfigured = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}`, headers,
    payload: {
      layoutId: "stack",
      collage: {
        ...collageScene.collage,
        frame: { width: 10, color: "#aabbcc", shape: "torn" },
        rowDirection: "descending",
        overlapRatio: 0.49,
        cardAngles: collageScene.materials.map(({ id }) => ({ materialId: id, angleDegrees: 0 })),
      },
    },
  });
  assert.equal(collageConfigured.statusCode, 200, collageConfigured.body);
  let configuredCollageScene = collageConfigured.json<Story>().scenes[0]!;
  assert.equal(configuredCollageScene.collage?.frame.width, 12,
    "legacy free-form widths migrate to the nearest supported preset");
  assert.equal(configuredCollageScene.collage?.frame.color, "#AABBCC");
  assert.equal(configuredCollageScene.collage?.rowDirection, "descending");
  assert.equal("overlapRatio" in configuredCollageScene.collage!, false,
    "legacy clients cannot override layout-owned overlap");
  assert.ok(configuredCollageScene.collage!.cardAngles.every(({ angleDegrees }) => angleDegrees !== 0),
    "the server must calculate hidden angles instead of accepting them from the editable request");
  const backgroundMultipart = multipartFile("background.png", "image/png", png);
  const withCustomBackground = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/collage-background/material`,
    payload: backgroundMultipart.body, headers: { ...headers, "content-type": backgroundMultipart.contentType },
  });
  assert.equal(withCustomBackground.statusCode, 201, withCustomBackground.body);
  const backgroundScene = withCustomBackground.json<Story>().scenes[0]!;
  assert.equal(backgroundScene.materials.length, 2, "background media must not become a collage card");
  assert.equal(backgroundScene.collageBackground?.source, "material");
  if (backgroundScene.collageBackground?.source !== "material") throw new Error("expected custom background material");
  const backgroundMaterial = backgroundScene.collageBackground.material;
  assert.equal(backgroundMaterial.name, "background.png");
  assert.deepEqual((await api.inject({
    method: "GET", url: `/stories/${story.id}/materials/${backgroundMaterial.id}/content`, headers,
  })).rawPayload, png, "the special background remains available through the authorized material content API");
  const changedAfterBackground = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}`, headers,
    payload: { collage: {
      frame: { ...backgroundScene.collage!.frame, width: 16 },
      entryDurationSeconds: backgroundScene.collage!.entryDurationSeconds,
      rowDirection: backgroundScene.collage!.rowDirection,
      straightCards: backgroundScene.collage!.straightCards,
    } },
  });
  assert.equal(changedAfterBackground.statusCode, 200, changedAfterBackground.body);
  configuredCollageScene = changedAfterBackground.json<Story>().scenes[0]!;
  assert.equal(configuredCollageScene.collage?.frame.width, 16);
  assert.equal(configuredCollageScene.collageBackground?.source, "material");
  assert.equal(configuredCollageScene.collageBackground?.source === "material"
    ? configuredCollageScene.collageBackground.material.id : undefined, backgroundMaterial.id,
  "composition changes must preserve the separately stored background");
  const collageRender = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/renders`, headers, payload: { mode: "video" },
  });
  assert.equal(collageRender.statusCode, 202, collageRender.body);
  const collageJob = [...renderQueue.jobs.values()].find(({ id }) => id === collageRender.json<{ id: string }>().id)!;
  assert.equal(collageJob.input.rendererId, "collage");
  if (collageJob.input.rendererId !== "collage") throw new Error("expected collage render input");
  assert.equal(collageJob.input.layoutRendererId, "animated-collage.stack.v1");
  assert.equal(collageJob.input.layoutOverlapRatio, 0.4);
  assert.equal(collageJob.input.rendererVersion, 24);
  assert.equal(collageJob.input.background?.source, "custom-material");
  if (collageJob.input.background?.source !== "custom-material") throw new Error("expected custom background");
  assert.equal(collageJob.input.background.materialId, backgroundMaterial.id);
  assert.equal(collageJob.input.background.treatment, "original");
  assert.deepEqual(collageJob.input.settings.cardAngles, configuredCollageScene.collage?.cardAngles);
  assert.equal(collageJob.input.settings.rowDirection, "descending");
  assert.equal(collageJob.input.materials.length, 2);
  assert.deepEqual(collageJob.input.materials.map(({ width, height }) => ({ width, height })), [
    { width: 1, height: 1 }, { width: 1, height: 1 },
  ]);
  assert.deepEqual(collageJob.input.dependencies?.map(({ role }) => role), ["original", "image-edit", "original", "original"]);
  const removedBackground = await api.inject({
    method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}/collage-background`, headers,
  });
  assert.equal(removedBackground.statusCode, 200, removedBackground.body);
  assert.deepEqual(removedBackground.json<Story>().scenes[0]!.collageBackground, { source: "previous-scene" });
  assert.equal(removedBackground.json<Story>().scenes[0]!.materials.length, 2);
  await assert.rejects(access(join(mediaRoot, backgroundMaterial.storageKey)), { code: "ENOENT" });
  const twoMaterials = collageConfigured.json<Story>().scenes[0]!.materials;
  const secondMaterial = twoMaterials.find(({ name }) => name === "second.png")!;
  const reordered = await api.inject({
    method: "PUT", url: `/stories/${story.id}/scenes/${sceneId}/material-order`, headers,
    payload: { materialIds: [twoMaterials[1]!.id, twoMaterials[0]!.id] },
  });
  assert.equal(reordered.statusCode, 200);
  const reorderedScene = reordered.json<Story>().scenes[0]!;
  assert.deepEqual(reorderedScene.materials.map(({ name }) => name), ["second.png", "portrait.png"]);
  assert.deepEqual(reorderedScene.collage?.cardAngles.map(({ materialId }) => materialId),
    reorderedScene.materials.map(({ id }) => id));
  assert.notDeepEqual(reorderedScene.collage?.cardAngles, configuredCollageScene.collage?.cardAngles);
  const deleted = await api.inject({
    method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
  });
  assert.equal(deleted.statusCode, 200);
  const deletedScene = deleted.json<Story>().scenes[0]!;
  assert.deepEqual(deletedScene.materials.map(({ name }) => name), ["second.png"]);
  assert.equal(deletedScene.collage, undefined);
  assert.equal((await api.inject({
    method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
  })).statusCode, 404);
  await assert.rejects(access(join(mediaRoot, uploaded.storageKey)), { code: "ENOENT" });
  await assert.rejects(access(join(mediaRoot, latestEditStorageKey)), { code: "ENOENT" });
  const editedSecond = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}/materials/${secondMaterial.id}`, headers,
    payload: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  const secondIntermediateKey = editedSecond.json<{
    scenes: { materials: { id: string; edit?: { result: { storageKey: string } } }[] }[];
  }>().scenes[0]!.materials.find(({ id }) => id === secondMaterial.id)!.edit!.result.storageKey;
  const removedScene = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}`, headers });
  assert.equal(removedScene.statusCode, 200);
  assert.deepEqual(repository.deletedSceneStorageKeys, [secondMaterial.storageKey, secondIntermediateKey]);
  await api.close();
});
