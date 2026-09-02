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

test("a scene keeps only its latest render output and rejects obsolete downloads", async (context) => {
  const { api, application, queue, storage, repository, storyId, profileId, headers, sceneId, otherSceneId } = await renderFixture(context);
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
  assert.equal(queue.jobs.size, 2);
  assert.deepEqual((await list()).map(({ current }) => current), [true]);
  assert.equal((await api.inject({ method: "GET", url: `${rendersUrl}/${first.id}`, headers })).statusCode, 404);

  await application.configureScene(profileId, storyId, sceneId, { durationSeconds: 5 });
  const reverted = await request(sceneId);
  assert.notEqual(reverted.id, first.id);
  assert.equal(queue.jobs.size, 2);
  await queue.complete(reverted.id, "worker", "reverted.mp4", bytes.length, contentHash);
  const reopened = await buildApi(new StoryApplication(repository), { mediaStorage: new MediaStorage(storage), objectStorage: storage, renderQueue: queue });
  context.after(() => reopened.close());
  await storage.put("reverted.mp4", { body: Readable.from(bytes), contentType: "video/mp4", contentLength: bytes.length });
  const download = await reopened.inject({ method: "GET", url: `${rendersUrl}/${reverted.id}/content`, headers });
  assert.equal(download.statusCode, 200, download.body);
  assert.equal(download.headers["cache-control"], "private, no-store");
  assert.deepEqual(download.rawPayload, bytes);
  assert.equal((await api.inject({ method: "GET", url: rendersUrl })).statusCode, 401);
  const other = await application.register({ name: "Other", email: "other-version@example.com", password: "long-test-password" });
  assert.equal((await api.inject({ method: "GET", url: rendersUrl, headers: { authorization: `Bearer ${other.accessToken}` } })).statusCode, 404);
  await application.deleteScene(profileId, storyId, sceneId);
  assert.equal((await api.inject({ method: "GET", url: `${rendersUrl}/${first.id}/content`, headers })).statusCode, 404);
});

test("scene frames are separate lossless base-visual PNG artifacts and follow scene cache invalidation", async (context) => {
  const { api, application, queue, storage, storyId, profileId, headers, sceneId } = await renderFixture(context);
  const framesUrl = `/stories/${storyId}/scenes/${sceneId}/frames`;
  const firstResponse = await api.inject({ method: "POST", url: framesUrl, headers });
  assert.equal(firstResponse.statusCode, 202, firstResponse.body);
  const first = firstResponse.json<{
    id: string; artifact: string; current: boolean; inputHash: string;
    mode?: string; parameters: { artifact?: string; frame?: { layerPolicy?: string } };
  }>();
  assert.equal(first.artifact, "scene-frame");
  assert.equal(first.current, true);
  assert.equal(first.mode, undefined);
  assert.equal(first.parameters.artifact, "scene-frame");
  assert.equal(first.parameters.frame?.layerPolicy, "base-visual");
  assert.deepEqual((await api.inject({ method: "GET", url: `/stories/${storyId}/scenes/${sceneId}/renders`, headers })).json(), []);

  const bytes = Buffer.from("png-last-base-frame");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `projects/${profileId}/${storyId}/scenes/${sceneId}/frames/${first.inputHash}.png`;
  await storage.put(storageKey, { body: Readable.from(bytes), contentType: "image/png", contentLength: bytes.length });
  await queue.complete(first.id, "worker", storageKey, bytes.length, contentHash);
  const content = await api.inject({ method: "GET", url: `${framesUrl}/${first.id}/content`, headers });
  assert.equal(content.statusCode, 200, content.body);
  assert.equal(content.headers["content-type"], "image/png");
  assert.match(content.headers["content-disposition"]!, /^inline;/);
  assert.deepEqual(content.rawPayload, bytes);

  await application.configureScene(profileId, storyId, sceneId, { durationSeconds: 8 });
  const stale = await api.inject({ method: "GET", url: `${framesUrl}/${first.id}/content`, headers });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json<{ code: string }>().code, "scene_frame_stale");
  const changed = await api.inject({ method: "POST", url: framesUrl, headers });
  assert.equal(changed.statusCode, 202, changed.body);
  assert.notEqual(changed.json<{ id: string }>().id, first.id);
  assert.equal((await api.inject({ method: "GET", url: `${framesUrl}/${first.id}`, headers: {
    authorization: `Bearer ${(await application.register({ name: "Frame Other", email: "frame-other@example.com", password: "long-test-password" })).accessToken}`,
  } })).statusCode, 404);
});

test("collage render uses a ready final frame from the immediately previous scene", async (context) => {
  const { api, application, queue, storyId, profileId, headers, sceneId, otherSceneId } = await renderFixture(context);
  const frameResponse = await api.inject({
    method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/frames`, headers,
  });
  assert.equal(frameResponse.statusCode, 202, frameResponse.body);
  const frame = frameResponse.json<{ id: string; inputHash: string }>();
  const frameStorageKey = `projects/${profileId}/${storyId}/previous-frame.png`;
  const frameContentHash = "f".repeat(64);
  await queue.complete(frame.id, "worker", frameStorageKey, 123, frameContentHash);

  await application.addSceneMaterial(profileId, storyId, otherSceneId, {
    kind: "image", name: "second.png", storageKey: "second.png", mimeType: "image/png",
    contentHash: "e".repeat(64), sizeBytes: 100, width: 1600, height: 900, orientation: "landscape",
  });
  const response = await api.inject({
    method: "POST", url: `/stories/${storyId}/scenes/${otherSceneId}/renders`, headers,
  });
  assert.equal(response.statusCode, 202, response.body);
  const job = [...queue.jobs.values()].find(({ id }) => id === response.json<{ id: string }>().id)!;
  assert.equal(job.input.rendererId, "collage");
  if (job.input.rendererId !== "collage") throw new Error("expected collage input");
  assert.deepEqual(job.input.background, {
    source: "previous-scene-frame",
    treatment: "darkened",
    sceneId,
    inputHash: frame.inputHash,
    contentHash: frameContentHash,
    storageKey: frameStorageKey,
    name: "previous-scene-frame.png",
    mimeType: "image/png",
    width: 1080,
    height: 1920,
    orientation: "portrait",
  });
  assert.equal(job.input.dependencies?.at(-1)?.role, "scene-frame");
  assert.deepEqual(job.input.dependencies?.at(-1)?.parameters, { sceneId, inputHash: frame.inputHash });
  assert.equal((await api.inject({
    method: "GET", url: `/stories/${storyId}/scenes/${otherSceneId}/renders/${job.id}`, headers,
  })).json<{ current: boolean }>().current, true);
  await application.configureScene(profileId, storyId, sceneId, { durationSeconds: 6 });
  assert.equal((await api.inject({
    method: "GET", url: `/stories/${storyId}/scenes/${otherSceneId}/renders/${job.id}`, headers,
  })).json<{ current: boolean }>().current, false);
});

test("legacy material hashes come from bytes and match new uploads; legacy renders are not current", async (context) => {
  const { api, application, queue, storage, storyId, profileId, headers, sceneId } = await renderFixture(context);
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
  const { api, application, storyId, profileId, headers, otherSceneId: sceneId } = await renderFixture(context);
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

test("timeline API recalculates trimmed video timing and warnings from the stored order", async (context) => {
  const { api, application, story: initial, headers } = await sceneDeletionFixture(context);
  const [photo, video, empty] = initial.scenes;
  const metadata = { name: "photo.png", storageKey: "photo.png", mimeType: "image/png", orientation: "portrait" as const, width: 100, height: 200, sizeBytes: 100 };
  await application.addSceneMaterial(initial.profileId, initial.id, photo!.id, { ...metadata, kind: "image" });
  let story = await application.addSceneMaterial(initial.profileId, initial.id, video!.id, {
    ...metadata, kind: "video", hasAudio: false, audioTags: [], sourceDurationSeconds: 200,
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 1.25, endSeconds: 190 } },
  });
  const url = `/stories/${story.id}/timeline`;
  const response = await api.inject({ method: "GET", url, headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers["cache-control"], "private, no-store");
  const timeline = response.json<StoryTimelineResponse>();
  assert.equal(timeline.totalDurationSeconds, 193.766667);
  assert.equal(timeline.totalFrames, 5_813);
  assert.equal(timeline.revision, story.revision);
  assert.deepEqual(timeline.warnings, [{ code: "empty_scene", sceneId: empty!.id }]);
  assert.equal(timeline.formatLimits.find(({ formatId }) => formatId === "youtube-shorts")!.excessSeconds, 13.766667);
  assert.equal(timeline.formatLimits.find(({ formatId }) => formatId === "youtube-video")!.status, "within_limit");
  assert.equal(timeline.formatLimits.find(({ formatId }) => formatId === "youtube-video-verified")!.requiresVerifiedAccount, true);
  const sceneIds = [video!.id, empty!.id, photo!.id];
  const reordered = await api.inject({ method: "PUT", url: `/stories/${story.id}/scene-order`, headers,
    payload: { sceneIds, expectedRevision: story.revision } });
  assert.equal(reordered.statusCode, 200, reordered.body);
  story = reordered.json<Story>();
  assert.deepEqual((await api.inject({ method: "GET", url: `/stories/${story.id}`, headers })).json<Story>(), story);
  const changed = (await api.inject({ method: "GET", url, headers })).json<StoryTimelineResponse>();
  assert.deepEqual(changed.sceneOrder, sceneIds);
  assert.deepEqual(changed.scenes.map(({ startSeconds }) => startSeconds), [0, 188.766667, 188.766667]);
  assert.deepEqual(changed.scenes.map(({ startFrame }) => startFrame), [0, 5_663, 5_663]);
  assert.equal(changed.totalDurationSeconds, timeline.totalDurationSeconds);
  await application.configureScene(story.profileId, story.id, photo!.id, { durationSeconds: 10 });
  assert.equal((await api.inject({ method: "GET", url, headers })).json<StoryTimelineResponse>().totalDurationSeconds, 198.766667);
});
