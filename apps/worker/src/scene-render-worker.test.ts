import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue } from "@storyteller/render-queue";
import { sceneRenderStorageKey } from "@storyteller/render-queue";
import { LocalObjectStorage } from "@storyteller/storage";
import { SceneRenderWorker } from "./scene-render-worker.js";

test("worker renders a claimed scene and stores the reusable artifact", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from(Buffer.from("photo")), contentType: "image/jpeg", contentLength: 5 });
  const queue = new MemoryQueue(renderJob());
  const worker = new SceneRenderWorker("worker-1", queue, storage, async (spec) => {
    assert.deepEqual(spec.focusPoint, { x: 0.25, y: 0.6 });
    await writeFile(spec.outputPath, "rendered-mp4");
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(queue.ready?.storageKey, sceneRenderStorageKey(renderJob()));
  assert.equal((await readFile(join(root, queue.ready!.storageKey))).toString(), "rendered-mp4");
});

test("worker processes object deletion jobs", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-delete-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("old/scene.mp4", { body: Readable.from(Buffer.from("old")), contentType: "video/mp4", contentLength: 3 });
  const queue = new MemoryQueue(undefined, { storageKey: "old/scene.mp4" });
  const worker = new SceneRenderWorker("worker-1", queue, storage);

  assert.equal(await worker.runOnce(), true);
  assert.equal(queue.deleted, "old/scene.mp4");
  await assert.rejects(readFile(join(root, "old/scene.mp4")), { code: "ENOENT" });
});

test("worker schedules cleanup when a scene disappears during rendering", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-race-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from(Buffer.from("photo")), contentType: "image/jpeg", contentLength: 5 });
  const queue = new MemoryQueue(renderJob(), undefined, false);
  const worker = new SceneRenderWorker("worker-1", queue, storage, async (spec) => writeFile(spec.outputPath, "orphan"));

  await worker.runOnce();
  assert.equal(queue.scheduled, sceneRenderStorageKey(renderJob()));
  await worker.runOnce();
  await assert.rejects(readFile(join(root, sceneRenderStorageKey(renderJob()))), { code: "ENOENT" });
});

class MemoryQueue implements SceneRenderQueue {
  ready?: { storageKey: string; sizeBytes: number };
  deleted?: string;
  scheduled?: string;
  private claimed = false;
  private deletionClaimed = false;

  constructor(private readonly job?: SceneRenderJob, private deletion?: ObjectDeletionJob, private readonly completeAccepted = true) {}
  enqueue(): Promise<SceneRenderJob> { throw new Error("not used"); }
  findAuthorized(): Promise<SceneRenderJob | undefined> { return Promise.resolve(undefined); }
  claim(): Promise<SceneRenderJob | undefined> {
    if (this.claimed) return Promise.resolve(undefined);
    this.claimed = true;
    return Promise.resolve(this.job);
  }
  complete(_renderId: string, _workerId: string, storageKey: string, sizeBytes: number): Promise<boolean> {
    if (!this.completeAccepted) return Promise.resolve(false);
    this.ready = { storageKey, sizeBytes };
    return Promise.resolve(true);
  }
  fail(): Promise<void> { throw new Error("render unexpectedly failed"); }
  scheduleDeletion(storageKey: string): Promise<void> {
    this.scheduled = storageKey;
    this.deletion = { storageKey };
    this.deletionClaimed = false;
    return Promise.resolve();
  }
  claimDeletion(): Promise<ObjectDeletionJob | undefined> {
    if (this.deletionClaimed) return Promise.resolve(undefined);
    this.deletionClaimed = true;
    return Promise.resolve(this.deletion);
  }
  completeDeletion(storageKey: string): Promise<void> { this.deleted = storageKey; return Promise.resolve(); }
  failDeletion(): Promise<void> { throw new Error("deletion unexpectedly failed"); }
}

function renderJob(): SceneRenderJob {
  return {
    id: "render", profileId: "profile", storyId: "story", sceneId: "scene", inputHash: "hash", status: "running",
    input: {
      rendererId: "still-image", rendererVersion: 1,
      material: {
        storageKey: "source/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg",
        width: 1600, height: 900, orientation: "landscape",
      },
      durationSeconds: 5, motion: "pan-left", focusPoint: { x: 0.25, y: 0.6 },
      output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
    },
  };
}
