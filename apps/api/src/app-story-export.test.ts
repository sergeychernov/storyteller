import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { StoryApplication } from "@storyteller/application";
import type {
  ClaimedStoryExport, SoundtrackRenderJob, SoundtrackRenderQueue, StoryExportJob, StoryExportQueue,
} from "@storyteller/render-queue";
import { buildApi } from "./server.js";
import { MediaStorage } from "./media-storage.js";
import { LocalObjectStorage } from "./object-storage.js";
import { hashTimeline } from "./story-exports.js";
import { MemoryRepository } from "./app-test-support.js";

test("story export API creates one immutable parallel segment manifest and restores its status", async (context) => {
  process.env.NODE_ENV = "test";
  const root = await mkdtemp(join(tmpdir(), "storyteller-export-api-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemoryStoryExportQueue();
  const api = await buildApi(application, {
    mediaStorage: new MediaStorage(storage), objectStorage: storage, exportQueue: queue,
  });
  context.after(() => api.close());
  const auth = await application.register({ name: "Exporter", email: "exporter@example.com", password: "long-test-password" });
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  const storyId = (await application.createStory(auth.profile.id, { title: "Master" })).id;
  const sceneIds: string[] = [];
  for (const color of ["red", "blue"] as const) {
    const story = await application.createScene(auth.profile.id, storyId);
    const sceneId = story.scenes.at(-1)!.id;
    sceneIds.push(sceneId);
    const png = Buffer.from(`not-decoded-${color}`);
    // Store the fixture directly because this test exercises export orchestration, not Sharp decoding.
    const key = `${auth.profile.id}/${storyId}/${sceneId}/${color}.png`;
    await storage.put(key, { body: Readable.from(png), contentType: "image/png", contentLength: png.length });
    await application.addSceneMaterial(auth.profile.id, storyId, sceneId, {
      kind: "image", name: `${color}.png`, orientation: "portrait", storageKey: key, mimeType: "image/png",
      sizeBytes: png.length, width: 1080, height: 1920, contentHash: createHash("sha256").update(png).digest("hex"),
    });
  }
  let story = await application.getStory(auth.profile.id, storyId);
  const timelineHash = hashTimeline(story);
  repository.stories.set(storyId, story = {
    ...story,
  });

  const requested = await api.inject({
    method: "POST", url: `/stories/${storyId}/exports`, headers,
    payload: { expectedRevision: story.revision, outputProfileId: "vertical-social-v1" },
  });
  assert.equal(requested.statusCode, 202, requested.body);
  assert.equal(queue.job?.manifest.segments.length, 2);
  assert.deepEqual(queue.job?.manifest.segments.map(({ position, sceneId, input }) => ({
    position, sceneId, artifact: input.artifact, output: input.output,
  })), sceneIds.map((sceneId, position) => ({
    position, sceneId, artifact: "story-export-segment",
    output: {
      width: 1080, height: 1920, fps: 30, codec: "h264", profileId: "vertical-social-v1",
      frameRate: { numerator: 30, denominator: 1 }, durationFrames: 150,
    },
  })));
  const current = await api.inject({ method: "GET", url: `/stories/${storyId}/exports/current`, headers });
  assert.equal(current.statusCode, 200, current.body);
  assert.equal(current.json<{ totalSegments: number }>().totalSegments, 2);

  repository.stories.set(storyId, { ...story, revision: story.revision + 1 });
  const staleDownload = await api.inject({
    method: "GET", url: `/stories/${storyId}/exports/${queue.job!.id}/content`, headers,
  });
  assert.equal(staleDownload.statusCode, 409);
  assert.equal(staleDownload.json<{ code: string }>().code, "story_export_stale");
});

test("story export rejects empty scenes before building anything", async (context) => {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemoryStoryExportQueue();
  const api = await buildApi(application, { exportQueue: queue });
  context.after(() => api.close());
  const auth = await application.register({ name: "Exporter", email: "empty-export@example.com", password: "long-test-password" });
  const storyId = (await application.createStory(auth.profile.id, { title: "Empty" })).id;
  const story = await application.createScene(auth.profile.id, storyId);
  const response = await api.inject({
    method: "POST", url: `/stories/${storyId}/exports`, headers: { authorization: `Bearer ${auth.accessToken}` },
    payload: { expectedRevision: story.revision, outputProfileId: "vertical-social-v1" },
  });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json<{ code: string }>().code, "story_export_empty_scene");
  assert.equal(queue.job, undefined);
});

test("the master carries the story's own music at the levels the creator set", async (context) => {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemoryStoryExportQueue();
  const soundtracks = new MemorySoundtrackLookup();
  const api = await buildApi(application, { exportQueue: queue, soundtrackQueue: soundtracks });
  context.after(() => api.close());
  const auth = await application.register({ name: "Mixer", email: "mixer@example.com", password: "long-test-password" });
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  const storyId = (await application.createStory(auth.profile.id, { title: "With music" })).id;
  const scene = await application.createScene(auth.profile.id, storyId);
  const sceneId = scene.scenes.at(-1)!.id;
  await application.addSceneMaterial(auth.profile.id, storyId, sceneId, {
    kind: "image", name: "one.png", orientation: "portrait", storageKey: "one.png", mimeType: "image/png",
    sizeBytes: 4, width: 1080, height: 1920, contentHash: "d".repeat(64),
  });
  let story = await application.getStory(auth.profile.id, storyId);
  const timeline = await application.getStoryTimeline(auth.profile.id, storyId);
  story = await application.setStorySoundtrackMix(auth.profile.id, storyId, story.revision,
    { video: 1, rhythm: 0.8, melody: 0.4, duckedMelody: 0.2 });
  soundtracks.ready = readySoundtrack(auth.profile.id, storyId, timeline.totalFrames, timeline.frameRate);

  const withMusic = await api.inject({ method: "POST", url: `/stories/${storyId}/exports`, headers,
    payload: { expectedRevision: story.revision, outputProfileId: "vertical-social-v1" } });
  assert.equal(withMusic.statusCode, 202, withMusic.body);
  assert.deepEqual(queue.job?.manifest.soundtrack, {
    renderId: soundtracks.ready.id,
    rhythm: { storageKey: "rhythm.flac", contentHash: "a".repeat(64) },
    melody: { storageKey: "melody.flac", contentHash: "b".repeat(64) },
  });
  assert.deepEqual(queue.job?.manifest.levels, { video: 1, rhythm: 0.8, melody: 0.4, duckedMelody: 0.2 });

  // A scene whose video carries sound gets its own audio segment; a still image contributes silence instead.
  assert.deepEqual(queue.job?.manifest.audioSegments, []);
  queue.reset();
  const added = await application.createScene(auth.profile.id, storyId);
  const videoSceneId = added.scenes.at(-1)!.id;
  const video = await application.addSceneMaterial(auth.profile.id, storyId, videoSceneId, {
    kind: "video", name: "clip.mp4", orientation: "portrait", storageKey: "clip.mp4", mimeType: "video/mp4",
    sizeBytes: 8, width: 1080, height: 1920, hasAudio: true, audioTags: [], sourceDurationSeconds: 12,
    contentHash: "e".repeat(64),
  });
  const withVideo = await api.inject({ method: "POST", url: `/stories/${storyId}/exports`, headers,
    payload: { expectedRevision: video.revision, outputProfileId: "vertical-social-v1" } });
  assert.equal(withVideo.statusCode, 202, withVideo.body);
  assert.deepEqual(queue.job?.manifest.audioSegments.map(({ position, sceneId: id }) => ({ position, sceneId: id })),
    [{ position: 1, sceneId: videoSceneId }], "only the scene that carries sound gets an audio segment");
  assert.match(JSON.stringify(queue.job?.manifest.audioSegments), /"mode":"audio"/u);
  assert.equal(queue.job?.manifest.segments.length, 2, "every scene still gets its visual segment");
  story = await application.getStory(auth.profile.id, storyId);

  // The master stays current only while the story's music is unchanged.
  const fresh = await api.inject({ method: "GET", url: `/stories/${storyId}/exports/current`, headers });
  assert.equal(fresh.json<{ current: boolean }>().current, true);
  await application.setStorySoundtrackMix(auth.profile.id, storyId, story.revision,
    { video: 1, rhythm: 0.5, melody: 0.4, duckedMelody: 0.2 });
  const afterLevels = await api.inject({ method: "GET", url: `/stories/${storyId}/exports/current`, headers });
  assert.equal(afterLevels.json<{ current: boolean }>().current, false, "a level change must invalidate the master");
  soundtracks.ready = { ...soundtracks.ready, id: "00000000-0000-4000-8000-0000000000bb" };
  const afterMelody = await api.inject({ method: "GET", url: `/stories/${storyId}/exports/current`, headers });
  assert.equal(afterMelody.json<{ current: boolean }>().current, false, "another melody must invalidate the master");

  // A soundtrack made for another cut of the story is not the story's music; the master stays silent instead.
  queue.reset();
  soundtracks.ready = readySoundtrack(auth.profile.id, storyId, timeline.totalFrames + 30, timeline.frameRate);
  const stale = await api.inject({ method: "POST", url: `/stories/${storyId}/exports`, headers,
    payload: { expectedRevision: story.revision, outputProfileId: "vertical-social-v1" } });
  assert.equal(stale.statusCode, 202, stale.body);
  assert.equal(queue.job?.manifest.soundtrack, undefined);
});

function readySoundtrack(
  profileId: string, storyId: string, totalFrames: number,
  frameRate: { readonly numerator: number; readonly denominator: number },
): SoundtrackRenderJob {
  return {
    id: "00000000-0000-4000-8000-0000000000aa", profileId, storyId, inputHash: "e".repeat(64),
    status: "ready", progressPercent: 100, progressPhase: "ready", createdAt: "2026-09-05T00:00:00.000Z",
    input: {
      version: 1, storyRevision: 1, frameRate, totalFrames, totalSampleFrames: 48_000,
      presetId: "road", presetVersion: 1, engineId: "storyteller-procedural", engineVersion: 5,
      seed: "f".repeat(64), melodyVariant: 0,
    },
    rhythmStem: { storageKey: "rhythm.flac", contentHash: "a".repeat(64), sizeBytes: 1, mimeType: "audio/flac" },
    melodyStem: { storageKey: "melody.flac", contentHash: "b".repeat(64), sizeBytes: 1, mimeType: "audio/flac" },
  };
}

class MemorySoundtrackLookup implements SoundtrackRenderQueue {
  ready?: SoundtrackRenderJob;
  async findCurrentAuthorized() { return this.ready; }
  enqueue(): never { throw new Error("not used"); }
  findAuthorized(): never { throw new Error("not used"); }
  claim(): never { throw new Error("not used"); }
  reportProgress(): never { throw new Error("not used"); }
  complete(): never { throw new Error("not used"); }
  fail(): never { throw new Error("not used"); }
}

class MemoryStoryExportQueue implements StoryExportQueue {
  async findSilentVideo() { return undefined; }
  async saveSilentVideo() { return false; }
  job: StoryExportJob | undefined;
  reset() { this.job = undefined; }
  async enqueue(job: Pick<StoryExportJob, "id" | "profileId" | "storyId" | "manifestHash" | "manifest">) {
    this.job ??= {
      ...job, status: "queued", progressPercent: 0, progressPhase: "queued",
      readySegments: 0, totalSegments: job.manifest.segments.length, createdAt: new Date().toISOString(),
    };
    return this.job;
  }
  async findCurrentAuthorized(profileId: string, storyId: string) {
    return this.job?.profileId === profileId && this.job.storyId === storyId ? this.job : undefined;
  }
  async findAuthorized(profileId: string, storyId: string, exportId: string) {
    return this.job?.profileId === profileId && this.job.storyId === storyId && this.job.id === exportId ? this.job : undefined;
  }
  claimAssembly(): Promise<ClaimedStoryExport | undefined> { return Promise.resolve(undefined); }
  reportAssemblyProgress(): Promise<boolean> { return Promise.resolve(false); }
  complete(): Promise<boolean> { return Promise.resolve(false); }
  fail(): Promise<void> { return Promise.resolve(); }
}

test("exporting an animated collage whose first card has sound creates only a visual segment", async (context) => {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemoryStoryExportQueue();
  const api = await buildApi(application, { exportQueue: queue });
  context.after(() => api.close());
  const auth = await application.register({ name: "Collage", email: "collage-master@example.com", password: "long-test-password" });
  const storyId = (await application.createStory(auth.profile.id, { title: "Collage" })).id;
  const sceneId = (await application.createScene(auth.profile.id, storyId)).scenes[0]!.id;
  await application.addSceneMaterial(auth.profile.id, storyId, sceneId, {
    kind: "video", name: "video.mp4", storageKey: "video.mp4", mimeType: "video/mp4", sizeBytes: 1,
    width: 900, height: 1600, orientation: "portrait", hasAudio: true, audioTags: [], sourceDurationSeconds: 5, contentHash: "a".repeat(64),
  });
  for (const orientation of ["portrait", "landscape"] as const) {
    await application.addSceneMaterial(auth.profile.id, storyId, sceneId, {
      kind: "image", name: `${orientation}.png`, storageKey: `${orientation}.png`, mimeType: "image/png", sizeBytes: 1,
      width: orientation === "portrait" ? 900 : 1600, height: orientation === "portrait" ? 1600 : 900, orientation, contentHash: "b".repeat(64),
    });
  }
  const story = await application.getStory(auth.profile.id, storyId);
  assert.equal(story.scenes[0]!.rendererId, "collage");
  const result = await api.inject({ method: "POST", url: `/stories/${storyId}/exports`,
    headers: { authorization: `Bearer ${auth.accessToken}` },
    payload: { expectedRevision: story.revision, outputProfileId: "vertical-social-v1" } });
  assert.equal(result.statusCode, 202, result.body);
  assert.equal(queue.job?.manifest.segments[0]?.input.rendererId, "collage");
  assert.deepEqual(queue.job?.manifest.audioSegments, []);
});
