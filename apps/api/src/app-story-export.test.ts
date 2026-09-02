import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { StoryApplication } from "@storyteller/application";
import type { ClaimedStoryExport, StoryExportJob, StoryExportQueue } from "@storyteller/render-queue";
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
    approvedMix: {
      storageKey: "approved.m4a", contentHash: "a".repeat(64), mimeType: "audio/mp4", sizeBytes: 1,
      sampleRate: 48000, channels: 2, timelineHash, durationFrames: 300,
    },
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

test("story export rejects empty scenes before the approved mix prerequisite", async (context) => {
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

class MemoryStoryExportQueue implements StoryExportQueue {
  job?: StoryExportJob;
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
