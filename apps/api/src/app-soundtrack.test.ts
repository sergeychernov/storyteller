import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { StoryApplication } from "@storyteller/application";
import type {
  SoundtrackArtifacts, SoundtrackCompletion, SoundtrackProvenance, SoundtrackRenderJob, SoundtrackRenderPhase, SoundtrackRenderQueue,
} from "@storyteller/render-queue";
import { buildApi } from "./server.js";
import { MemoryRepository } from "./app-test-support.js";
import { LocalObjectStorage } from "./object-storage.js";

test("soundtrack API exposes presets and idempotently queues music for the exact story duration", async (context) => {
  process.env.NODE_ENV = "test";
  const root = await mkdtemp(join(tmpdir(), "storyteller-soundtrack-api-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemorySoundtrackQueue();
  const storage = new LocalObjectStorage(root);
  const api = await buildApi(application, { soundtrackQueue: queue, objectStorage: storage });
  context.after(() => api.close());
  const auth = await application.register({ name: "Composer", email: "composer@example.com", password: "long-test-password" });
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  const storyId = (await application.createStory(auth.profile.id, { title: "Road" })).id;
  const story = await application.createScene(auth.profile.id, storyId);
  await application.addSceneMaterial(auth.profile.id, storyId, story.scenes[0]!.id, {
    kind: "image", name: "road.jpg", storageKey: "road.jpg", mimeType: "image/jpeg",
    sizeBytes: 1, width: 1080, height: 1920, orientation: "portrait",
  });
  const currentStory = await application.getStory(auth.profile.id, storyId);

  const presets = await api.inject({ method: "GET", url: "/soundtrack-presets", headers });
  assert.equal(presets.statusCode, 200, presets.body);
  assert.deepEqual(presets.json<{ id: string; default: boolean }[]>(), [
    { id: "road", version: 1, bpm: 96, default: true },
    { id: "lounge", version: 1, bpm: 84, default: false },
    { id: "dnb", version: 1, bpm: 174, default: false },
  ]);
  const request = { method: "POST" as const, url: `/stories/${storyId}/soundtracks`, headers,
    payload: { expectedRevision: currentStory.revision, presetId: "road" } };
  const first = await api.inject(request);
  const repeated = await api.inject(request);
  assert.equal(first.statusCode, 202, first.body);
  assert.equal(repeated.statusCode, 202, repeated.body);
  assert.equal(first.json<{ id: string }>().id, repeated.json<{ id: string }>().id);
  assert.equal(queue.job?.input.totalFrames, 150);
  assert.equal(queue.job?.input.totalSampleFrames, 240_000);
  assert.equal(queue.job?.input.seed.length, 64);
  assert.equal(first.json<{ current: boolean }>().current, true);
  assert.equal((await api.inject({ method: "GET", url: `/stories/${storyId}/soundtracks/current`, headers })).statusCode, 200);

  const ready = queue.markReady();
  await storage.put(ready.preview!.storageKey, {
    body: Readable.from(Buffer.from("test-m4a")), contentType: "audio/mp4", contentLength: 8,
  });
  const audio = await api.inject({ method: "GET", url: `/stories/${storyId}/soundtracks/${ready.id}/audio`, headers });
  assert.equal(audio.statusCode, 200, audio.body);
  assert.equal(audio.headers["content-type"], "audio/mp4");
  assert.equal(audio.rawPayload.toString(), "test-m4a");
  const download = await api.inject({ method: "GET", url: `/stories/${storyId}/soundtracks/${ready.id}/audio?download=true`, headers });
  assert.match(download.headers["content-disposition"] ?? "", /attachment; filename=.*\.m4a/);
  const provenance = await api.inject({ method: "GET", url: `/stories/${storyId}/soundtracks/${ready.id}/provenance`, headers });
  assert.equal(provenance.statusCode, 200, provenance.body);
  assert.equal(provenance.json<{ externalAudioAssets: boolean }>().externalAudioAssets, false);
  assert.equal(provenance.json<{ previewSha256: string }>().previewSha256, "b".repeat(64));

  const other = await application.register({ name: "Other", email: "other-composer@example.com", password: "long-test-password" });
  const forbidden = await api.inject({ method: "GET", url: `/stories/${storyId}/soundtracks/${ready.id}/audio`,
    headers: { authorization: `Bearer ${other.accessToken}` } });
  assert.equal(forbidden.statusCode, 404, forbidden.body);

  const changed = await application.configureScene(auth.profile.id, storyId, currentStory.scenes[0]!.id, { durationSeconds: 6 });
  const changedResponse = await api.inject({ ...request, payload: { expectedRevision: changed.revision, presetId: "road" } });
  assert.equal(changedResponse.statusCode, 202, changedResponse.body);
  assert.notEqual(changedResponse.json<{ id: string }>().id, first.json<{ id: string }>().id);
  assert.notEqual(changedResponse.json<{ inputHash: string }>().inputHash, first.json<{ inputHash: string }>().inputHash);
  assert.equal(changedResponse.json<{ totalSampleFrames: number }>().totalSampleFrames, 288_000);
});

test("soundtrack API rejects empty stories, stale revisions, and stories over three minutes", async (context) => {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemorySoundtrackQueue();
  const api = await buildApi(application, { soundtrackQueue: queue });
  context.after(() => api.close());
  const auth = await application.register({ name: "Limits", email: "limits@example.com", password: "long-test-password" });
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  const storyId = (await application.createStory(auth.profile.id, { title: "Empty" })).id;
  const empty = await application.getStory(auth.profile.id, storyId);
  const emptyResponse = await api.inject({ method: "POST", url: `/stories/${storyId}/soundtracks`, headers,
    payload: { expectedRevision: empty.revision, presetId: "road" } });
  assert.equal(emptyResponse.statusCode, 422);
  assert.equal(emptyResponse.json<{ code: string }>().code, "soundtrack_empty_story");
  const stale = await api.inject({ method: "POST", url: `/stories/${storyId}/soundtracks`, headers,
    payload: { expectedRevision: empty.revision + 1, presetId: "road" } });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json<{ code: string }>().code, "story_revision_conflict");

  let longStory = empty;
  for (let index = 0; index < 12; index += 1) {
    longStory = await application.createScene(auth.profile.id, storyId);
    const sceneId = longStory.scenes.at(-1)!.id;
    longStory = await application.addSceneMaterial(auth.profile.id, storyId, sceneId, {
      kind: "image", name: `${index}.jpg`, storageKey: `${index}.jpg`, mimeType: "image/jpeg",
      sizeBytes: 1, width: 1080, height: 1920, orientation: "portrait",
    });
    longStory = await application.configureScene(auth.profile.id, storyId, sceneId, { durationSeconds: 15 });
  }
  const exactLimit = await api.inject({ method: "POST", url: `/stories/${storyId}/soundtracks`, headers,
    payload: { expectedRevision: longStory.revision, presetId: "road" } });
  assert.equal(exactLimit.statusCode, 202, exactLimit.body);
  assert.equal(exactLimit.json<{ totalSampleFrames: number }>().totalSampleFrames, 180 * 48_000);

  longStory = await application.createScene(auth.profile.id, storyId);
  const finalSceneId = longStory.scenes.at(-1)!.id;
  longStory = await application.addSceneMaterial(auth.profile.id, storyId, finalSceneId, {
    kind: "image", name: "12.jpg", storageKey: "12.jpg", mimeType: "image/jpeg",
    sizeBytes: 1, width: 1080, height: 1920, orientation: "portrait",
  });
  longStory = await application.configureScene(auth.profile.id, storyId, finalSceneId, { durationSeconds: 15 });
  const tooLong = await api.inject({ method: "POST", url: `/stories/${storyId}/soundtracks`, headers,
    payload: { expectedRevision: longStory.revision, presetId: "road" } });
  assert.equal(tooLong.statusCode, 422);
  assert.equal(tooLong.json<{ code: string }>().code, "soundtrack_duration_limit_exceeded");
});

class MemorySoundtrackQueue implements SoundtrackRenderQueue {
  job?: SoundtrackRenderJob;
  async enqueue(value: Pick<SoundtrackRenderJob, "id" | "profileId" | "storyId" | "inputHash" | "input">) {
    if (!this.job || this.job.inputHash !== value.inputHash) this.job = {
      ...value, status: "queued", progressPercent: 0, progressPhase: "queued", createdAt: new Date().toISOString(),
    };
    return this.job;
  }
  async findCurrentAuthorized(profileId: string, storyId: string) {
    return this.job?.profileId === profileId && this.job.storyId === storyId ? this.job : undefined;
  }
  async findAuthorized(profileId: string, storyId: string, renderId: string) {
    return this.job?.profileId === profileId && this.job.storyId === storyId && this.job.id === renderId ? this.job : undefined;
  }
  claim(): Promise<SoundtrackRenderJob | undefined> { return Promise.resolve(undefined); }
  reportProgress(_id: string, _worker: string, _percent: number,
    _phase: Exclude<SoundtrackRenderPhase, "queued" | "ready">): Promise<boolean> { return Promise.resolve(false); }
  complete(_id: string, _worker: string, _artifacts: SoundtrackArtifacts,
    _provenance: SoundtrackProvenance): Promise<SoundtrackCompletion> {
    return Promise.resolve({ accepted: false, supersededStorageKeys: [] });
  }
  fail(): Promise<void> { return Promise.resolve(); }

  markReady(): SoundtrackRenderJob {
    if (!this.job) throw new Error("soundtrack job was not queued");
    const hashes = { previewPcmSha256: "a".repeat(64), previewSha256: "b".repeat(64),
      rhythmStemSha256: "c".repeat(64), melodyStemSha256: "d".repeat(64),
      rhythmPreviewSha256: "e".repeat(64), melodyPreviewSha256: "f".repeat(64) };
    this.job = {
      ...this.job, status: "ready", progressPercent: 100, progressPhase: "ready",
      preview: { storageKey: "soundtracks/test.m4a", contentHash: hashes.previewSha256, sizeBytes: 8, mimeType: "audio/mp4" },
      rhythmStem: { storageKey: "soundtracks/rhythm.flac", contentHash: hashes.rhythmStemSha256, sizeBytes: 1, mimeType: "audio/flac" },
      melodyStem: { storageKey: "soundtracks/melody.flac", contentHash: hashes.melodyStemSha256, sizeBytes: 1, mimeType: "audio/flac" },
      rhythmPreview: { storageKey: "soundtracks/rhythm.m4a", contentHash: hashes.rhythmPreviewSha256, sizeBytes: 2, mimeType: "audio/mp4" },
      melodyPreview: { storageKey: "soundtracks/melody.m4a", contentHash: hashes.melodyPreviewSha256, sizeBytes: 2, mimeType: "audio/mp4" },
      provenance: {
        origin: "storyteller_procedural", engineId: "storyteller-procedural", engineVersion: 5,
        presetId: this.job.input.presetId, presetVersion: 1, seed: this.job.input.seed,
        melodyVariant: this.job.input.melodyVariant,
        sampleRate: 48_000, channels: 2, sampleFrames: this.job.input.totalSampleFrames,
        durationFrames: this.job.input.totalFrames, frameRate: this.job.input.frameRate,
        ...hashes, externalAudioAssets: false, licenseVersion: "storyteller-generated-music-1.0",
        generatedAt: "2026-09-04T00:00:00.000Z",
      },
    };
    return this.job;
  }
}
