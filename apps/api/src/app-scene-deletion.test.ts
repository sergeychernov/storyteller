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
import { MemoryRenderQueue, MemoryRepository, sceneDeletionFixture } from "./app-test-support.js";

process.env.NODE_ENV = "test";

test("deletes first, middle, last and only scenes and persists the returned draft", async (context) => {
  for (const [sceneCount, index] of [[3, 0], [3, 1], [3, 2], [1, 0]] as const) {
    await context.test(`${index + 1} of ${sceneCount}`, async (context) => {
      const { api, repository, story, headers } = await sceneDeletionFixture(context, sceneCount);
      const target = story.scenes[index]!;
      const before: Story = {
        ...story, status: "ready",
        narrations: story.scenes.map(({ id }) => ({ id: randomUUID(), assetId: randomUUID(), fromSceneId: id })),
      };
      repository.stories.set(story.id, before);
      const response = await api.inject({
        method: "DELETE", url: `/stories/${story.id}/scenes/${target.id}`, headers,
        payload: { expectedRevision: before.revision },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.headers["cache-control"], "private, no-store");
      const changed = response.json<Story>();
      assert.deepEqual(changed.scenes, before.scenes.filter(({ id }) => id !== target.id));
      assert.deepEqual(changed.narrations, before.narrations.filter(({ fromSceneId }) => fromSceneId !== target.id));
      assert.equal(changed.revision, before.revision + 1);
      assert.equal(changed.status, "draft");
      const persisted = await api.inject({ method: "GET", url: `/stories/${story.id}`, headers });
      assert.deepEqual(persisted.json(), changed);
      const summaries = await api.inject({ method: "GET", url: "/stories", headers });
      assert.equal(summaries.json<{ sceneCount: number }[]>()[0]?.sceneCount, sceneCount - 1);
      const repeated = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${target.id}`, headers });
      assert.equal(repeated.statusCode, 404);
      assert.equal(repeated.json<{ code: string }>().code, "scene_not_found");
      assert.deepEqual(repository.stories.get(story.id), changed);
    });
  }
});

test("scene deletion validates access, revision and editable state without side effects", async (context) => {
  const { api, application, repository, story, headers } = await sceneDeletionFixture(context);
  const url = `/stories/${story.id}/scenes/${story.scenes[0]!.id}`;
  assert.equal((await api.inject({ method: "DELETE", url })).statusCode, 401);
  assert.equal((await api.inject({ method: "DELETE", url, headers: { authorization: "Bearer invalid" } })).statusCode, 401);
  const other = await application.register({ name: "Other", email: "other@example.com", password: "long-test-password" });
  const foreign = await api.inject({ method: "DELETE", url, headers: { authorization: `Bearer ${other.accessToken}` } });
  assert.equal(foreign.statusCode, 404);
  assert.equal((await api.inject({ method: "DELETE", url: `/stories/${randomUUID()}/scenes/${randomUUID()}`, headers })).statusCode, 404);
  const missingScene = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${randomUUID()}`, headers });
  assert.equal(missingScene.statusCode, 404);
  assert.equal(missingScene.json<{ code: string }>().code, "scene_not_found");
  assert.equal((await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/not-a-uuid`, headers })).statusCode, 400);
  for (const expectedRevision of [0, -1, 1.5, "3"]) {
    assert.equal((await api.inject({ method: "DELETE", url, headers, payload: { expectedRevision } })).statusCode, 400);
  }
  assert.equal((await api.inject({ method: "DELETE", url, headers, payload: { expectedRevison: story.revision } })).statusCode, 400);
  for (const expectedRevision of [story.revision - 1, story.revision + 1]) {
    const conflict = await api.inject({ method: "DELETE", url, headers, payload: { expectedRevision } });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json<{ code: string }>().code, "story_revision_conflict");
  }
  assert.deepEqual(repository.stories.get(story.id), story);
  for (const status of ["rendering", "publishing", "published"] as const) {
    const locked = { ...story, status };
    repository.stories.set(story.id, locked);
    const response = await api.inject({ method: "DELETE", url, headers });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<{ code: string }>().code, "story_not_editable");
    assert.deepEqual(repository.stories.get(story.id), locked);
  }
  assert.deepEqual(repository.deletedSceneStorageKeys, []);
});

test("scene deletion deduplicates cleanup keys and preserves media referenced by surviving scenes", async (context) => {
  const { api, repository, story, headers } = await sceneDeletionFixture(context, 2);
  const target = story.scenes[0]!;
  const retained = story.scenes[1]!;
  const video: SceneMaterial = {
    id: randomUUID(), kind: "video", name: "clip.mp4", orientation: "landscape", width: 1920, height: 1080,
    storageKey: "source.mp4", mimeType: "video/mp4", sizeBytes: 1_000, hasAudio: true, audioTags: [],
    videoTrack: { storageKey: "video.mp4", mimeType: "video/mp4", sizeBytes: 800, durationSeconds: 5 },
    audioTrack: {
      storageKey: "audio.m4a", mimeType: "audio/mp4", sizeBytes: 200, durationSeconds: 5, channels: 2, sampleRate: 48_000,
      processing: { version: 1, filter: "test", integratedLufs: -16, truePeakDbfs: -1.5 },
    },
    edit: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 }, result: {
      storageKey: "edited.mp4", mimeType: "video/mp4", sizeBytes: 800, width: 1080, height: 1920, orientation: "portrait",
    } },
  };
  const image: SceneMaterial = {
    id: randomUUID(), kind: "image", name: "shared.png", storageKey: "shared.png", mimeType: "image/png",
    orientation: "landscape", width: 100, height: 100, sizeBytes: 200,
  };
  const background: SceneMaterial = {
    ...image, id: randomUUID(), name: "background.png", storageKey: "background.png",
  };
  const before = { ...story, scenes: [
    { ...target, materials: [video, { ...video, id: randomUUID() }, image],
      collageBackground: { source: "material" as const, material: background } },
    { ...retained, materials: [{ ...image, id: randomUUID() }] },
  ] };
  repository.stories.set(story.id, before);
  const response = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${target.id}`, headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(new Set(repository.deletedSceneStorageKeys), new Set([
    "source.mp4", "video.mp4", "audio.m4a", "edited.mp4", "background.png",
  ]));
  assert.equal(repository.deletedSceneStorageKeys.length, 5);
  assert.deepEqual(response.json<Story>().scenes, [before.scenes[1]]);
});

test("scene deletion reports a concurrent save conflict without scheduling cleanup", async (context) => {
  const { api, repository, story, headers } = await sceneDeletionFixture(context);
  const concurrent = { ...story, revision: story.revision + 1 };
  const persistDelete = repository.deleteScene.bind(repository);
  repository.deleteScene = async (changed, sceneId, storageKeys) => {
    repository.stories.set(story.id, concurrent);
    await persistDelete(changed, sceneId, storageKeys);
  };
  const response = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${story.scenes[0]!.id}`, headers });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json<{ code: string }>().code, "story_revision_conflict");
  assert.deepEqual(repository.stories.get(story.id), concurrent);
  assert.deepEqual(repository.deletedSceneStorageKeys, []);
});

test("render requests return 404 if the scene disappears before enqueue", async (context) => {
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const renderQueue: SceneRenderQueue = new MemoryRenderQueue();
  let enqueueCalls = 0;
  const api = await buildApi(application, { renderQueue });
  context.after(() => api.close());
  const auth = await application.register({ name: "Test", email: "race@example.com", password: "long-test-password" });
  const created = await application.createStory(auth.profile.id, { title: "Render race" });
  const story = await application.createScene(auth.profile.id, created.id);
  const scene = story.scenes[0]!;
  renderQueue.enqueue = async () => {
    enqueueCalls++;
    await application.deleteScene(auth.profile.id, story.id, scene.id);
    return undefined;
  };
  await application.addSceneMaterial(auth.profile.id, story.id, scene.id, {
    kind: "image", name: "image.png", storageKey: "image.png", mimeType: "image/png", contentHash: "a".repeat(64),
    orientation: "landscape", width: 100, height: 100, sizeBytes: 200,
  });
  const response = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${scene.id}/renders`, headers: { authorization: `Bearer ${auth.accessToken}` },
  });
  assert.equal(response.statusCode, 404, response.body);
  assert.equal(response.json<{ code: string }>().code, "scene_not_found");
  assert.equal(enqueueCalls, 1);
});

test("documents the backwards-compatible scene deletion contract in OpenAPI", async (context) => {
  const { api } = await sceneDeletionFixture(context);
  await api.ready();
  const operation = (api.swagger() as OpenAPIV3.Document).paths["/stories/{storyId}/scenes/{sceneId}"]?.delete;
  assert.equal(operation?.operationId, "deleteScene");
  assert.deepEqual(Object.keys(operation?.responses ?? {}).sort(), ["200", "400", "401", "403", "404", "409"]);
  assert.ok(operation?.requestBody && "content" in operation.requestBody);
  assert.notEqual(operation.requestBody.required, true);
});
