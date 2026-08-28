import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.ok(queue.ready?.storageKey.startsWith(sceneRenderStorageKey(renderJob()).slice(0, -4)));
  assert.equal(queue.ready?.contentHash, createHash("sha256").update("rendered-mp4").digest("hex"));
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

test("worker logs the failing render stage and persists the error", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-error-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from(Buffer.from("photo")), contentType: "image/jpeg", contentLength: 5 });
  const queue = new MemoryQueue(renderJob());
  const errors: Array<{ message: string; details: Record<string, unknown> }> = [];
  const worker = new SceneRenderWorker("worker-1", queue, storage, async () => {
    throw new Error("ffmpeg test failure");
  }, 10_000, {
    info() {},
    error(message, details) { errors.push({ message, details }); },
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(queue.failed, "ffmpeg test failure");
  assert.deepEqual(errors, [{
    message: "scene render failed",
    details: {
      renderId: "render", storyId: "story", sceneId: "scene", rendererId: "still-image",
      motion: "pan-left", durationSeconds: 5, sourceWidth: 1600, sourceHeight: 900,
      outputWidth: 1080, outputHeight: 1920, stage: "render", error: "ffmpeg test failure",
    },
  }]);
});

test("worker schedules cleanup when a scene disappears during rendering", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-race-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from(Buffer.from("photo")), contentType: "image/jpeg", contentLength: 5 });
  const queue = new MemoryQueue(renderJob(), undefined, false);
  const worker = new SceneRenderWorker("worker-1", queue, storage, async (spec) => writeFile(spec.outputPath, "orphan"));

  await worker.runOnce();
  assert.ok(queue.scheduled?.startsWith(sceneRenderStorageKey(renderJob()).slice(0, -4)));
  await worker.runOnce();
  await assert.rejects(readFile(join(root, queue.scheduled!)), { code: "ENOENT" });
});

test("worker downloads only the tracks required by the export mode", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-tracks-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  for (const mode of ["video", "audio", "combined"] as const) {
    const opened: string[] = [];
    let contentType = "";
    const job: SceneRenderJob = { ...renderJob(), inputHash: mode, input: {
      ...renderJob().input, rendererId: "video", mode, hasAudio: true, sourceDurationSeconds: 8,
      edit: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 1, endSeconds: 3 } },
      audio: { storageKey: "source/audio.m4a", name: "audio.m4a", mimeType: "audio/mp4" },
    } };
    const queue = new MemoryQueue(job);
    const worker = new SceneRenderWorker("worker-1", queue, {
      async open(key) { opened.push(key); return Readable.from("track"); },
      async put(key, object) { contentType = object.contentType; await storage.put(key, object); },
      delete: (key) => storage.delete(key),
    }, undefined, undefined, undefined, async (spec) => {
      assert.equal(Boolean(spec.sourcePath), mode !== "audio");
      assert.equal(Boolean(spec.audioPath), mode !== "video");
      assert.equal(spec.mode, mode);
      assert.deepEqual(spec.edit.trim, { startSeconds: 1, endSeconds: 3 });
      await writeFile(spec.outputPath, `rendered-${mode}`);
    });
    await worker.runOnce();
    assert.deepEqual(opened, mode === "audio" ? ["source/audio.m4a"]
      : mode === "video" ? ["source/photo.jpg"] : ["source/photo.jpg", "source/audio.m4a"]);
    assert.equal(contentType, mode === "audio" ? "audio/mp4" : "video/mp4");
    assert.ok(queue.ready?.storageKey.startsWith(sceneRenderStorageKey(job).slice(0, -4)));
    assert.equal(queue.failed, undefined);
  }
});

test("worker refuses source bytes that differ from the saved version", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-hash-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from("changed"), contentType: "image/jpeg", contentLength: 7 });
  const job = renderJob();
  const queue = new MemoryQueue({ ...job, input: { ...job.input, material: { ...job.input.material, contentHash: "a".repeat(64) } } });
  let renders = 0;
  await new SceneRenderWorker("worker", queue, storage, async () => { renders++; }).runOnce();
  assert.equal(renders, 0);
  assert.equal(queue.ready, undefined);
  assert.match(queue.failed!, /source content does not match/);
});

test("cleanup from a superseded worker cannot delete another attempt's accepted file", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-attempt-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from("photo"), contentType: "image/jpeg", contentLength: 5 });
  const accepted = new MemoryQueue(renderJob());
  const superseded = new MemoryQueue(renderJob(), undefined, false);
  const lateWorker = new SceneRenderWorker("late", superseded, storage, async (spec) => writeFile(spec.outputPath, "late"));
  await new SceneRenderWorker("winner", accepted, storage, async (spec) => writeFile(spec.outputPath, "winner")).runOnce();
  await lateWorker.runOnce();
  assert.notEqual(accepted.ready!.storageKey, superseded.scheduled);
  await lateWorker.runOnce();
  assert.equal(await readFile(join(root, accepted.ready!.storageKey), "utf8"), "winner");
});

class MemoryQueue implements SceneRenderQueue {
  ready?: { storageKey: string; sizeBytes: number; contentHash: string };
  failed?: string;
  deleted?: string;
  scheduled?: string;
  private claimed = false;
  private deletionClaimed = false;

  constructor(private readonly job?: SceneRenderJob, private deletion?: ObjectDeletionJob, private readonly completeAccepted = true) {}
  enqueue(): Promise<SceneRenderJob> { throw new Error("not used"); }
  findAuthorized(): Promise<SceneRenderJob | undefined> { return Promise.resolve(undefined); }
  async listAuthorized(): Promise<readonly SceneRenderJob[]> { return []; }
  claim(): Promise<SceneRenderJob | undefined> {
    if (this.claimed) return Promise.resolve(undefined);
    this.claimed = true;
    return Promise.resolve(this.job);
  }
  complete(_renderId: string, _workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean> {
    if (!this.completeAccepted) return Promise.resolve(false);
    this.ready = { storageKey, sizeBytes, contentHash };
    return Promise.resolve(true);
  }
  fail(_renderId: string, _workerId: string, error: string): Promise<void> { this.failed = error; return Promise.resolve(); }
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
