import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ApplicationError, StoryApplication, type PlatformCredentialSummary, type ProfileAuthentication, type SessionRecord, type StoryRepository } from "@storyteller/application";
import { getMaterialPresentation, materialStorageKeys, type PlatformCredential, type PlatformProvider, type Profile, type SceneMaterial, type Story } from "@storyteller/domain";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue } from "@storyteller/render-queue";
import { probeMedia, renderVideo, SpawnMediaProcessRunner } from "@storyteller/renderer";
import { Readable } from "node:stream";
import type { LightMyRequestResponse } from "fastify";
import type { OpenAPIV3 } from "openapi-types";
import { sceneRenderFileType, sceneRenderStorageKey } from "@storyteller/render-queue";
import sharp from "sharp";
import { normalizeStoredStory } from "./database.js";
import { buildApi } from "./server.js";
import { detectMediaMetadata, MediaStorage } from "./media-storage.js";
import { LocalObjectStorage, S3ObjectStorage } from "./object-storage.js";

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
    method: "POST", url: "/auth/sign-in", payload: { name: "Sergej", email: "sergej@example.com", password: "long-test-password" },
  });
  assert.equal(registration.statusCode, 200);
  const auth = registration.json<{ accessToken: string; profile: Profile }>();
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  assert.equal((await api.inject({ method: "GET", url: "/profile", headers })).json<Profile>().email, "sergej@example.com");

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
  const twoMaterials = withSecondPhoto.json<{ scenes: { materials: { id: string; name: string; storageKey: string }[] }[] }>().scenes[0]!.materials;
  const secondMaterial = twoMaterials.find(({ name }) => name === "second.png")!;
  const reordered = await api.inject({
    method: "PUT", url: `/stories/${story.id}/scenes/${sceneId}/material-order`, headers,
    payload: { materialIds: [twoMaterials[1]!.id, twoMaterials[0]!.id] },
  });
  assert.equal(reordered.statusCode, 200);
  assert.deepEqual(reordered.json<{ scenes: { materials: { name: string }[] }[] }>().scenes[0]!.materials.map(({ name }) => name), ["second.png", "portrait.png"]);
  const deleted = await api.inject({
    method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
  });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json<{ scenes: { materials: { name: string }[] }[] }>().scenes[0]!.materials.map(({ name }) => name), ["second.png"]);
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
  const before = { ...story, scenes: [
    { ...target, materials: [video, { ...video, id: randomUUID() }, image] },
    { ...retained, materials: [{ ...image, id: randomUUID() }] },
  ] };
  repository.stories.set(story.id, before);
  const response = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${target.id}`, headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(new Set(repository.deletedSceneStorageKeys), new Set(["source.mp4", "video.mp4", "audio.m4a", "edited.mp4"]));
  assert.equal(repository.deletedSceneStorageKeys.length, 4);
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
  assert.deepEqual(Object.keys(operation?.responses ?? {}).sort(), ["200", "400", "401", "404", "409"]);
  assert.ok(operation?.requestBody && "content" in operation.requestBody);
  assert.notEqual(operation.requestBody.required, true);
});

test("serves each crop/rotation result without caching old pixels and renders the edited dimensions", async (context) => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-edit-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const objectStorage = new LocalObjectStorage(mediaRoot);
  const renderQueue = new MemoryRenderQueue();
  const api = await buildApi(new StoryApplication(new MemoryRepository()), {
    mediaStorage: new MediaStorage(objectStorage), objectStorage, renderQueue,
  });
  context.after(() => api.close());
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Editor test", email: "editor@example.com", password: "long-test-password" },
  });
  const headers = { authorization: `Bearer ${registration.json<{ accessToken: string }>().accessToken}` };
  const storyResponse = await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "Edited pixels" } });
  const storyId = storyResponse.json<{ id: string }>().id;
  const withScene = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes`, headers });
  const sceneId = withScene.json<Story>().scenes[0]!.id;
  const red = [255, 0, 0], green = [0, 255, 0], blue = [0, 0, 255], white = [255, 255, 255];
  const cyan = [0, 255, 255], magenta = [255, 0, 255], yellow = [255, 255, 0], black = [0, 0, 0];
  const png = await sharp(Buffer.from([red, green, blue, white, cyan, magenta, yellow, black].flat()), {
    raw: { width: 4, height: 2, channels: 3 },
  }).png().toBuffer();
  const multipart = multipartFile("color-grid.png", "image/png", png);
  const uploaded = await api.inject({
    method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/materials`,
    payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType },
  });
  const original = uploaded.json<Story>().scenes[0]!.materials[0]!;
  assert.equal((await api.inject({
    method: "GET", url: `/stories/${storyId}/materials/${original.id}/waveform`, headers,
  })).statusCode, 422);
  const invalidTrim = await api.inject({
    method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers,
    payload: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0, endSeconds: 1 } },
  });
  assert.equal(invalidTrim.statusCode, 422);
  let previousKey: string | undefined;
  for (const [edit, size, pixels] of [
    [{ rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } }, [2, 4], [cyan, red, magenta, green, yellow, blue, black, white]],
    [{ rotation: 270, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, [1, 2], [white, blue]],
  ] as const) {
    const response = await api.inject({
      method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers, payload: edit,
    });
    assert.equal(response.statusCode, 200, response.body);
    const material = response.json<Story>().scenes[0]!.materials[0]!;
    const result = material.edit!.result!;
    assert.equal(material.storageKey, original.storageKey);
    assert.deepEqual([material.width, material.height], [4, 2]);
    assert.deepEqual([result.width, result.height], size);
    assert.equal(result.orientation, "portrait");
    assert.deepEqual({ rotation: material.edit!.rotation, crop: material.edit!.crop }, edit);
    if (previousKey) await assert.rejects(access(join(mediaRoot, previousKey)), { code: "ENOENT" });
    previousKey = result.storageKey;
    const content = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
    assert.equal(content.headers["cache-control"], "private, no-store");
    assert.equal(result.contentHash, createHash("sha256").update(content.rawPayload).digest("hex"));
    const decoded = await sharp(content.rawPayload).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([decoded.info.width, decoded.info.height], size);
    assert.deepEqual(decoded.data, Buffer.from(pixels.flat()));
    const source = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/source-content`, headers });
    assert.deepEqual(source.rawPayload, png);
    const render = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/renders`, headers });
    assert.equal(render.statusCode, 202, render.body);
    const job = [...renderQueue.jobs.values()].find(({ id }) => id === render.json<{ id: string }>().id)!;
    assert.equal(job.input.material.storageKey, result.storageKey);
    assert.deepEqual([job.input.material.width, job.input.material.height], size);
    assert.equal(job.input.material.orientation, "portrait");
  }
  assert.equal(renderQueue.jobs.size, 2);
  const reset = await api.inject({
    method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers,
    payload: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  assert.equal(reset.json<Story>().scenes[0]!.materials[0]!.edit, undefined);
  await assert.rejects(access(join(mediaRoot, previousKey!)), { code: "ENOENT" });
  const restored = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
  assert.equal(restored.headers["cache-control"], "private, no-store");
  assert.deepEqual(restored.rawPayload, png);
});

test("stores separate processed tracks, saves video edits as metadata, and exports each selected mode", async (context) => {
  const runner = new SpawnMediaProcessRunner();
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-video-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const sourcePath = join(mediaRoot, "colors.mp4");
  async function ffmpeg(args: readonly string[]) {
    const result = await runner.run("ffmpeg", ["-y", "-v", "error", ...args]);
    assert.equal(result.exitCode, 0, result.stderr);
  }
  await ffmpeg([
    "-f", "lavfi", "-i", "color=c=red:s=160x96:r=10:d=2",
    "-f", "lavfi", "-i", "color=c=green:s=160x96:r=10:d=2",
    "-f", "lavfi", "-i", "color=c=blue:s=160x96:r=10:d=2",
    "-f", "lavfi", "-i", "aevalsrc=0.1*sin(2*PI*440*t)*(0.1+0.9*t/6):s=44100:d=6",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath,
  ]);
  // A partial upload must leave neither its archive nor one of its working tracks behind.
  const sourceBytes = await readFile(sourcePath);
  for (const failAt of [1, 2, 3]) {
    const rollbackRoot = join(mediaRoot, `rollback-${failAt}`);
    const rollbackObjects = new LocalObjectStorage(rollbackRoot);
    let puts = 0;
    const failingStorage = new MediaStorage({
      open: (key) => rollbackObjects.open(key), delete: (key) => rollbackObjects.delete(key),
      async put(key, object) {
        await rollbackObjects.put(key, object);
        if (++puts === failAt) throw new Error("simulated object upload failure");
      },
    });
    await assert.rejects(failingStorage.store({ filename: "source.mp4", mimetype: "video/mp4", file: Readable.from(sourceBytes) },
      { profileId: "profile", storyId: "story", sceneId: "scene" }));
    assert.deepEqual((await readdir(rollbackRoot, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()), []);
  }
  const objectsRoot = join(mediaRoot, "objects");
  const objectStorage = new LocalObjectStorage(objectsRoot);
  const repository = new MemoryRepository();
  const renderQueue = new MemoryRenderQueue();
  let processCalls = 0;
  const mediaStorage = new MediaStorage(objectStorage, { async run(command, args) {
    processCalls += 1;
    return runner.run(command, args);
  } });
  const api = await buildApi(new StoryApplication(repository), { mediaStorage, objectStorage, renderQueue });
  context.after(() => api.close());
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Video test", email: "video@example.com", password: "long-test-password" },
  });
  const headers = { authorization: `Bearer ${registration.json<{ accessToken: string }>().accessToken}` };
  const other = await api.inject({ method: "POST", url: "/auth/sign-in", payload: { name: "Other", email: "other@example.com", password: "long-test-password" } });
  const otherHeaders = { authorization: `Bearer ${other.json<{ accessToken: string }>().accessToken}` };
  const storyId = (await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "Video edits" } })).json<Story>().id;
  const identity = { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } } as const;

  for (const hasAudio of [true, false]) {
    const sceneId = (await api.inject({ method: "POST", url: `/stories/${storyId}/scenes`, headers })).json<Story>().scenes.at(-1)!.id;
    const uploadPath = hasAudio ? sourcePath : join(mediaRoot, "silent.mp4");
    if (!hasAudio) await ffmpeg(["-i", sourcePath, "-an", "-c:v", "copy", uploadPath]);
    const originalBytes = await readFile(uploadPath);
    const multipart = multipartFile("colors.mp4", "video/mp4", originalBytes);
    const uploaded = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/materials`,
      payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType } });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const original = uploaded.json<Story>().scenes.at(-1)!.materials[0]!;
    assert.equal(original.kind, "video");
    if (original.kind !== "video") throw new Error("expected video");
    assert.ok(original.videoTrack);
    assert.equal(Boolean(original.audioTrack), hasAudio);
    assert.deepEqual(await readFile(join(objectsRoot, original.storageKey)), originalBytes);
    const videoBytes = await readFile(join(objectsRoot, original.videoTrack.storageKey));
    assert.equal(original.contentHash, createHash("sha256").update(originalBytes).digest("hex"));
    assert.equal(original.videoTrack.contentHash, createHash("sha256").update(videoBytes).digest("hex"));
    const tracks = await probeMedia(join(objectsRoot, original.videoTrack.storageKey)) as { streams: { codec_type: string }[] };
    assert.deepEqual(tracks.streams.map((stream) => stream.codec_type), ["video"]);
    const audioUrl = `/stories/${storyId}/materials/${original.id}/audio-content`;
    assert.equal((await api.inject({ method: "GET", url: audioUrl })).statusCode, 401);
    assert.equal((await api.inject({ method: "GET", url: audioUrl, headers: otherHeaders })).statusCode, 404);
    assert.equal((await api.inject({ method: "GET", url: audioUrl, headers })).statusCode, hasAudio ? 200 : 404);
    if (original.audioTrack) {
      const track = original.audioTrack;
      assert.equal(track.contentHash, createHash("sha256").update(await readFile(join(objectsRoot, track.storageKey))).digest("hex"));
      assert.equal(track.sampleRate, 48_000);
      assert.equal(track.channels, 2);
      assert.ok(Math.abs(track.durationSeconds - 6) < 0.05);
      assert.ok(Math.abs(track.processing.integratedLufs! + 16) < 1, JSON.stringify(track.processing));
      assert.ok(track.processing.truePeakDbfs! < 0);
      const audioProbe = await probeMedia(join(objectsRoot, track.storageKey)) as { streams: { codec_type: string }[] };
      assert.deepEqual(audioProbe.streams.map((stream) => stream.codec_type), ["audio"]);
    }
    const waveformUrl = `/stories/${storyId}/materials/${original.id}/waveform`;
    const waveformResponse = await api.inject({ method: "GET", url: waveformUrl, headers });
    assert.equal(waveformResponse.statusCode, 200, waveformResponse.body);
    const peaks = waveformResponse.json<{ peaks: number[] }>().peaks;
    assert.equal(peaks.length, hasAudio ? 512 : 0);
    if (hasAudio) assert.equal(Math.max(...peaks), 1);
    const editUrl = `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`;
    const renderUrl = `/stories/${storyId}/scenes/${sceneId}/renders`;
    assert.equal((await api.inject({ method: "POST", url: renderUrl, headers, payload: { mode: "invalid" } })).statusCode, 400);
    for (const [trim, status] of [
      [{ startSeconds: -1, endSeconds: 3 }, 400], [{ startSeconds: 3, endSeconds: 3 }, 400],
      [{ startSeconds: 4, endSeconds: 3 }, 400], [{ startSeconds: 0, endSeconds: 7 }, 422],
    ] as const) assert.equal((await api.inject({ method: "PATCH", url: editUrl, headers, payload: { ...identity, trim } })).statusCode, status);

    for (const [edit, width, height, duration, channel] of [
      [{ ...identity, trim: { startSeconds: 2, endSeconds: 4 } }, 160, 96, 2, 1],
      [{ rotation: 90, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, trim: { startSeconds: 4.2, endSeconds: 5.5 } }, 48, 80, 1.3, 2],
    ] as const) {
      const callsBefore = processCalls;
      const filesBefore = await readdir(objectsRoot, { recursive: true });
      const edited = await api.inject({ method: "PATCH", url: editUrl, headers, payload: edit });
      assert.equal(edited.statusCode, 200, edited.body);
      assert.equal(processCalls, callsBefore, "editing must not decode or encode a video");
      assert.deepEqual(await readdir(objectsRoot, { recursive: true }), filesBefore, "editing must not create or replace files");
      const reopened = await api.inject({ method: "GET", url: `/stories/${storyId}`, headers });
      const persisted = normalizeStoredStory(reopened.json()).scenes.find((scene) => scene.id === sceneId)!.materials[0]!;
      assert.deepEqual(persisted.edit, edit);
      const presentation = getMaterialPresentation(persisted);
      assert.deepEqual([presentation.width, presentation.height], [width, height]);
      assert.ok(Math.abs(presentation.durationSeconds! - duration) < 0.001);
      assert.deepEqual(await readFile(join(objectsRoot, original.storageKey)), originalBytes);
      const content: LightMyRequestResponse = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
      assert.deepEqual(content.rawPayload, videoBytes);
      assert.deepEqual((await api.inject({ method: "GET", url: waveformUrl, headers })).json<{ peaks: number[] }>().peaks, peaks);

      for (const mode of ["video", "audio", "combined"] as const) {
        const requested = await api.inject({ method: "POST", url: renderUrl, headers, payload: { mode } });
        if (mode === "audio" && !hasAudio) { assert.equal(requested.statusCode, 422); continue; }
        assert.equal(requested.statusCode, 202, requested.body);
        const job = [...renderQueue.jobs.values()].find(({ id }) => id === requested.json<{ id: string }>().id)!;
        assert.equal(job.input.rendererId, "video");
        if (job.input.rendererId !== "video") throw new Error("expected video job");
        assert.equal(job.input.mode, mode);
        assert.deepEqual(job.input.edit, edit);
        const cached = await api.inject({ method: "POST", url: renderUrl, headers, payload: { mode } });
        assert.equal(cached.json<{ id: string }>().id, job.id);
        const file = sceneRenderFileType(job.input);
        const outputPath = join(mediaRoot, `export.${file.extension}`);
        await renderVideo({ sourcePath: join(objectsRoot, job.input.material.storageKey),
          ...(job.input.audio ? { audioPath: join(objectsRoot, job.input.audio.storageKey) } : {}),
          outputPath, sourceSize: job.input.material, sourceDurationSeconds: 6, hasAudio, mode, edit });
        const probe = await probeMedia(outputPath) as { streams: { codec_type: string; duration: string; start_time: string }[] };
        assert.deepEqual(probe.streams.map((stream) => stream.codec_type), mode === "audio" ? ["audio"] : mode === "combined" && hasAudio ? ["video", "audio"] : ["video"]);
        for (const stream of probe.streams) {
          assert.ok(Math.abs(Number(stream.duration) - duration) < 0.05, JSON.stringify(stream));
          assert.ok(Math.abs(Number(stream.start_time)) < 0.05, JSON.stringify(stream));
        }
        if (mode !== "audio") {
          const metadata = detectMediaMetadata(probe, "video");
          assert.deepEqual([metadata.width, metadata.height], [width, height]);
          for (const time of [0, duration - 0.2]) {
            const framePath = join(mediaRoot, "frame.png");
            await ffmpeg(["-ss", String(time), "-i", outputPath, "-frames:v", "1", framePath]);
            const frame = await sharp(await readFile(framePath)).stats();
            assert.ok(frame.channels[channel]!.mean > 100);
            assert.ok(frame.channels.filter((_, index) => index !== channel).every(({ mean }) => mean < 10));
          }
        }
        await ffmpeg(["-i", outputPath, "-f", "null", "-"]);
        const bytes = await readFile(outputPath);
        const key = sceneRenderStorageKey(job);
        await objectStorage.put(key, { body: Readable.from(bytes), contentType: file.mimeType, contentLength: bytes.length });
        await renderQueue.complete(job.id, "test", key, bytes.length, createHash("sha256").update(bytes).digest("hex"));
        const downloadUrl = `${renderUrl}/${job.id}/content`;
        assert.equal((await api.inject({ method: "GET", url: downloadUrl, headers: otherHeaders })).statusCode, 404);
        const downloaded = await api.inject({ method: "GET", url: downloadUrl, headers });
        assert.equal(downloaded.headers["content-type"], file.mimeType);
        assert.ok(downloaded.headers["content-disposition"]?.includes(`.${file.extension}`));
        assert.deepEqual(downloaded.rawPayload, bytes);
      }
    }
    const reset = await api.inject({ method: "PATCH", url: editUrl, headers, payload: identity });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal(reset.json<Story>().scenes.find((scene) => scene.id === sceneId)!.materials[0]!.edit, undefined);
    assert.deepEqual(await readFile(join(objectsRoot, original.storageKey)), originalBytes);
    await api.inject({ method: "DELETE", url: editUrl, headers });
    for (const key of materialStorageKeys(original)) await assert.rejects(access(join(objectsRoot, key)), { code: "ENOENT" });
  }
});

test("detects displayed orientation, rotation and an audio stream from probe data", () => {
  assert.deepEqual(detectMediaMetadata({ streams: [{ codec_type: "video", width: 1080, height: 1920 }] }, "image"), {
    width: 1080, height: 1920, orientation: "portrait", hasAudio: false,
  });
  assert.deepEqual(detectMediaMetadata({ streams: [
    { codec_type: "video", width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }, { codec_type: "audio" },
  ], format: { duration: "7.25" } }, "video"), {
    width: 1080, height: 1920, orientation: "portrait", hasAudio: true, sourceDurationSeconds: 7.25,
  });
});

test("creates a short-lived S3 download URL without exposing the secret key", async () => {
  const storage = new S3ObjectStorage({
    bucket: "storyteller-media",
    endpoint: "https://storage.example.com",
    region: "auto",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    downloadUrlTtlSeconds: 600,
  });
  const download = await storage.createDownloadUrl("profile/story/scene/material.png");
  const url = new URL(download.url);
  assert.equal(url.hostname, "storyteller-media.storage.example.com");
  assert.equal(url.pathname, "/profile/story/scene/material.png");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(url.searchParams.has("X-Amz-Signature"), true);
  assert.equal(download.url.includes("test-secret-key"), false);
});

test("opens a legacy story without fileless material placeholders", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy story",
    status: "draft",
    revision: 6,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      layoutId: "portrait-cascade-up",
      motion: "none",
      materials: [{ id: "08140c76-10ba-48c5-a000-fa56c9e7364a", kind: "image", name: "1", orientation: "portrait" }],
      render: { status: "ready", artifactId: "obsolete-preview" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.deepEqual(normalized.scenes[0]?.materials, []);
  assert.equal(normalized.scenes[0]?.layoutId, undefined);
  assert.equal(normalized.scenes[0]?.focusPoint, undefined);
  assert.deepEqual(normalized.scenes[0]?.render, { status: "idle" });
});

test("upgrades a legacy scene with one image to the still-image renderer", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy still",
    status: "draft",
    revision: 3,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 8,
      layoutId: "full-frame",
      motion: "zoom-in",
      materials: [{
        id: "08140c76-10ba-48c5-a000-fa56c9e7364a",
        kind: "image",
        name: "portrait.png",
        orientation: "portrait",
        storageKey: "profile/story/portrait.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        width: 1080,
        height: 1920,
      }],
      render: { status: "idle" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.equal(normalized.scenes[0]?.rendererId, "still-image");
  assert.deepEqual(normalized.scenes[0]?.focusPoint, { x: 0.5, y: 0.5 });
});

test("never exposes a stored platform secret", async () => {
  process.env.NODE_ENV = "test";
  const api = await buildApi(new StoryApplication(new MemoryRepository()));
  const registration = await api.inject({
    method: "POST", url: "/auth/register", payload: { name: "User", email: "user@example.com", password: "long-test-password" },
  });
  const token = registration.json<{ accessToken: string }>().accessToken;
  const response = await api.inject({
    method: "PUT", url: "/profile/platform-credentials/telegram", headers: { authorization: `Bearer ${token}` },
    payload: { secret: "telegram-secret-1234" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes("telegram-secret-1234"), false);
  assert.equal(response.json<{ secretHint: string }>().secretHint, "••••1234");
  await api.close();
});

test("render versions invalidate locally, reject stale downloads, survive reopening and reuse an exact revert", async (context) => {
  const { api, application, queue, storage, repository, storyId, profileId, headers, sceneId, otherSceneId } = await versionFixture(context);
  const sceneUrl = `/stories/${storyId}/scenes/${sceneId}`;
  const rendersUrl = `${sceneUrl}/renders`;
  const request = async (id: string) => {
    const response = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${id}/renders`, headers });
    assert.equal(response.statusCode, 202, response.body);
    return response.json<{ id: string; current: boolean; inputHash: string; dependencies: { contentHash: string }[] }>();
  };
  const first = await request(sceneId);
  const unaffected = await request(otherSceneId);
  assert.equal(first.current, true);
  assert.match(first.dependencies[0]!.contentHash, /^[a-f0-9]{64}$/);
  const list = async () => {
    const response = await api.inject({ method: "GET", url: rendersUrl, headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["cache-control"], "private, no-store");
    return response.json<{ id: string; current: boolean; contentHash?: string }[]>();
  };
  await application.configureScene(profileId, storyId, sceneId, { durationSeconds: 8 });
  // A worker finishes the old snapshot after the edit. It must remain obsolete.
  const bytes = Buffer.from("versioned-result");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  await storage.put("finished.mp4", { body: Readable.from(bytes), contentType: "video/mp4", contentLength: bytes.length });
  await queue.complete(first.id, "worker", "finished.mp4", bytes.length, contentHash);
  assert.deepEqual((await list()).map(({ id, current, contentHash }) => ({ id, current, contentHash })),
    [{ id: first.id, current: false, contentHash }]);
  const stale = await api.inject({ method: "GET", url: `${rendersUrl}/${first.id}/content`, headers });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json<{ code: string }>().code, "scene_render_stale");
  assert.equal((await request(otherSceneId)).id, unaffected.id);
  const changed = await request(sceneId);
  assert.notEqual(changed.id, first.id);
  assert.equal(queue.jobs.size, 3);
  assert.deepEqual((await list()).map(({ current }) => current), [true, false]);

  await application.configureScene(profileId, storyId, sceneId, { durationSeconds: 5 });
  assert.equal((await request(sceneId)).id, first.id);
  assert.equal(queue.jobs.size, 3);
  const reopened = await buildApi(new StoryApplication(repository), { mediaStorage: new MediaStorage(storage), objectStorage: storage, renderQueue: queue });
  context.after(() => reopened.close());
  const download = await reopened.inject({ method: "GET", url: `${rendersUrl}/${first.id}/content`, headers });
  assert.equal(download.statusCode, 200, download.body);
  assert.equal(download.headers["cache-control"], "private, no-store");
  assert.deepEqual(download.rawPayload, bytes);
  assert.equal((await api.inject({ method: "GET", url: rendersUrl })).statusCode, 401);
  const other = await application.register({ name: "Other", email: "other-version@example.com", password: "long-test-password" });
  assert.equal((await api.inject({ method: "GET", url: rendersUrl, headers: { authorization: `Bearer ${other.accessToken}` } })).statusCode, 404);
  await application.deleteScene(profileId, storyId, sceneId);
  assert.equal((await api.inject({ method: "GET", url: `${rendersUrl}/${first.id}/content`, headers })).statusCode, 404);
});

test("legacy material hashes come from bytes and match new uploads; legacy renders are not current", async (context) => {
  const { api, application, queue, storage, storyId, profileId, headers, sceneId } = await versionFixture(context);
  const url = `/stories/${storyId}/scenes/${sceneId}/renders`;
  const first = (await api.inject({ method: "POST", url, headers })).json<{ id: string }>();
  const material = (await application.getStory(profileId, storyId)).scenes[0]!.materials[0]!;
  const { contentHash, ...legacyMaterial } = material;
  assert.match(contentHash!, /^[a-f0-9]{64}$/);
  await application.replaceSceneMaterial(profileId, storyId, sceneId, legacyMaterial);
  assert.equal((await api.inject({ method: "POST", url, headers })).json<{ id: string }>().id, first.id);
  await storage.put(material.storageKey, { body: Readable.from("different bytes"), contentType: "image/png", contentLength: 15 });
  assert.equal((await api.inject({ method: "GET", url: `${url}/${first.id}`, headers })).json<{ current: boolean }>().current, false);
  const entry = [...queue.jobs.entries()][0]!;
  const { dependencies: _dependencies, ...oldInput } = entry[1].input;
  queue.jobs.set(entry[0], { ...entry[1], input: oldInput, status: "ready" });
  const legacy = await api.inject({ method: "GET", url: `${url}/${first.id}`, headers });
  assert.equal(legacy.statusCode, 200);
  assert.equal(legacy.json<{ current: boolean }>().current, false);
  await storage.delete(material.storageKey);
  assert.equal((await api.inject({ method: "GET", url: `${url}/${first.id}`, headers })).statusCode, 503);
  assert.equal((await api.inject({ method: "POST", url, headers })).statusCode, 503);
  assert.equal(queue.jobs.size, 1);
});

test("video dependencies preserve audio after visual edits and invalidate every affected export after trim", async (context) => {
  const { api, application, storyId, profileId, headers, otherSceneId: sceneId } = await versionFixture(context);
  const scene = (await application.getStory(profileId, storyId)).scenes.find(({ id }) => id === sceneId)!;
  await application.removeSceneMaterial(profileId, storyId, sceneId, scene.materials[0]!.id);
  const story = await application.addSceneMaterial(profileId, storyId, sceneId, {
    kind: "video", name: "clip.mp4", storageKey: "clip.mp4", contentHash: "a".repeat(64), mimeType: "video/mp4",
    sizeBytes: 100, width: 100, height: 100, orientation: "landscape", sourceDurationSeconds: 10, hasAudio: true, audioTags: [],
    videoTrack: { storageKey: "video.mp4", contentHash: "b".repeat(64), mimeType: "video/mp4", sizeBytes: 80, durationSeconds: 10 },
    audioTrack: { storageKey: "audio.m4a", contentHash: "c".repeat(64), mimeType: "audio/mp4", sizeBytes: 20, durationSeconds: 10,
      sampleRate: 48000, channels: 2, processing: { version: 1, filter: "anull", integratedLufs: -16, truePeakDbfs: -1 } },
  });
  const material = story.scenes.find(({ id }) => id === sceneId)!.materials[0]!;
  const url = `/stories/${storyId}/scenes/${sceneId}/renders`;
  const modes = ["audio", "video", "combined"] as const;
  const ids = new Map<string, string>();
  for (const mode of modes) {
    const response = await api.inject({ method: "POST", url, headers, payload: { mode } });
    assert.equal(response.statusCode, 202, response.body);
    const result = response.json<{ id: string; dependencies: { role: string }[] }>();
    ids.set(mode, result.id);
    assert.deepEqual(result.dependencies.map(({ role }) => role), mode === "audio" ? ["original", "audio-track"]
      : mode === "video" ? ["original", "video-track"] : ["original", "video-track", "audio-track"]);
  }
  const editUrl = `/stories/${storyId}/scenes/${sceneId}/materials/${material.id}`;
  const visualEdit = { rotation: 90, crop: { x: 0, y: 0, width: 0.5, height: 1 } };
  assert.equal((await api.inject({ method: "PATCH", url: editUrl, headers, payload: visualEdit })).statusCode, 200);
  for (const mode of modes) {
    const status = (await api.inject({ method: "GET", url: `${url}/${ids.get(mode)}`, headers })).json<{ current: boolean }>();
    assert.equal(status.current, mode === "audio");
  }
  assert.equal((await api.inject({ method: "POST", url, headers, payload: { mode: "audio" } })).json<{ id: string }>().id, ids.get("audio"));
  await api.inject({ method: "PATCH", url: editUrl, headers, payload: { ...visualEdit, trim: { startSeconds: 1, endSeconds: 9 } } });
  for (const id of ids.values()) assert.equal((await api.inject({ method: "GET", url: `${url}/${id}`, headers })).json<{ current: boolean }>().current, false);
});

async function versionFixture(context: TestContext) {
  process.env.NODE_ENV = "test";
  const root = await mkdtemp(join(tmpdir(), "storyteller-versions-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemoryRenderQueue();
  const api = await buildApi(application, { mediaStorage: new MediaStorage(storage), objectStorage: storage, renderQueue: queue });
  context.after(() => api.close());
  const auth = await application.register({ name: "Test", email: "versions@example.com", password: "long-test-password" });
  const profileId = auth.profile.id;
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  const storyId = (await application.createStory(profileId, { title: "Versions" })).id;
  const ids: string[] = [];
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).png().toBuffer();
  for (let index = 0; index < 2; index++) {
    const id = (await application.createScene(profileId, storyId)).scenes.at(-1)!.id;
    const multipart = multipartFile(`photo-${index}.png`, "image/png", png);
    const response = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${id}/materials`,
      headers: { ...headers, "content-type": multipart.contentType }, payload: multipart.body });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json<Story>().scenes.find(({ id: sceneId }) => sceneId === id)!.materials[0]!.contentHash,
      createHash("sha256").update(png).digest("hex"));
    ids.push(id);
  }
  return { api, application, queue, storage, repository, storyId, profileId, headers, sceneId: ids[0]!, otherSceneId: ids[1]! };
}

class MemoryRepository implements StoryRepository {
  readonly profiles = new Map<string, ProfileAuthentication>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly stories = new Map<string, Story>();
  readonly credentials = new Map<string, PlatformCredentialSummary>();
  deletedSceneStorageKeys: readonly string[] = [];
  async createProfileWithSession(profile: ProfileAuthentication, session: SessionRecord) {
    if ([...this.profiles.values()].some(({ email }) => email === profile.email)) return false;
    this.profiles.set(profile.id, profile); this.sessions.set(session.tokenHash, session); return true;
  }
  async findProfileAuthenticationByEmail(email: string) { return [...this.profiles.values()].find((profile) => profile.email === email); }
  async createSession(session: SessionRecord) { this.sessions.set(session.tokenHash, session); }
  async findProfileBySession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash); const profile = session && session.expiresAt > now ? this.profiles.get(session.profileId) : undefined;
    return profile && { id: profile.id, name: profile.name, email: profile.email };
  }
  async updateProfile(profileId: string, name: string) { const old = this.profiles.get(profileId)!; const profile = { ...old, name }; this.profiles.set(profileId, profile); return profile; }
  async createStory(story: Story) { this.stories.set(story.id, story); }
  async listStories(profileId: string) { return [...this.stories.values()].filter((story) => story.profileId === profileId); }
  async findStory(profileId: string, storyId: string) { const story = this.stories.get(storyId); return story?.profileId === profileId ? story : undefined; }
  async updateStory(story: Story) {
    const current = this.stories.get(story.id);
    if (!current || current.profileId !== story.profileId) throw new ApplicationError("story not found", 404);
    if (current.revision !== story.revision - 1) throw new ApplicationError("story has changed", 409, "story_revision_conflict");
    this.stories.set(story.id, story);
  }
  async deleteScene(story: Story, _sceneId: string, storageKeys: readonly string[]) {
    await this.updateStory(story);
    this.deletedSceneStorageKeys = storageKeys;
  }
  async upsertPlatformCredential(credential: PlatformCredential) {
    const summary = { id: credential.id, provider: credential.provider, secretHint: `••••${credential.secret.slice(-4)}` } satisfies PlatformCredentialSummary;
    this.credentials.set(`${credential.profileId}:${credential.provider}`, summary); return summary;
  }
  async listPlatformCredentials(profileId: string) { return [...this.credentials.entries()].filter(([key]) => key.startsWith(`${profileId}:`)).map(([, value]) => value); }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider) { return this.credentials.delete(`${profileId}:${provider}`); }
}

class MemoryRenderQueue implements SceneRenderQueue {
  readonly jobs = new Map<string, SceneRenderJob>();
  async enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">): Promise<SceneRenderJob> {
    const key = `${job.storyId}:${job.sceneId}:${job.inputHash}`;
    const existing = this.jobs.get(key);
    if (existing) return existing;
    const queued = { ...job, status: "queued" as const };
    this.jobs.set(key, queued);
    return queued;
  }
  findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined> {
    return Promise.resolve([...this.jobs.values()].find((job) => job.profileId === profileId && job.storyId === storyId
      && job.sceneId === sceneId && job.id === renderId));
  }
  async listAuthorized(profileId: string, storyId: string, sceneId: string): Promise<readonly SceneRenderJob[]> {
    return [...this.jobs.values()].filter((job) => job.profileId === profileId && job.storyId === storyId && job.sceneId === sceneId).reverse();
  }
  claim(): Promise<SceneRenderJob | undefined> { return Promise.resolve(undefined); }
  async complete(renderId: string, _workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean> {
    const entry = [...this.jobs.entries()].find(([, job]) => job.id === renderId);
    if (!entry) return false;
    this.jobs.set(entry[0], { ...entry[1], status: "ready", storageKey, sizeBytes, contentHash });
    return true;
  }
  fail(): Promise<void> { return Promise.resolve(); }
  scheduleDeletion(): Promise<void> { return Promise.resolve(); }
  claimDeletion(): Promise<ObjectDeletionJob | undefined> { return Promise.resolve(undefined); }
  completeDeletion(): Promise<void> { return Promise.resolve(); }
  failDeletion(): Promise<void> { return Promise.resolve(); }
}

async function sceneDeletionFixture(context: TestContext, sceneCount = 3) {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const api = await buildApi(application);
  context.after(() => api.close());
  const auth = await application.register({ name: "Test", email: "delete@example.com", password: "long-test-password" });
  const summary = await application.createStory(auth.profile.id, { title: "Deletion test" });
  let story = await application.getStory(auth.profile.id, summary.id);
  for (let index = 0; index < sceneCount; index++) story = await application.createScene(auth.profile.id, story.id);
  return { api, repository, application, story, headers: { authorization: `Bearer ${auth.accessToken}` } };
}

function multipartFile(filename: string, mimeType: string, content: Buffer) {
  const boundary = "storyteller-test-boundary";
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
