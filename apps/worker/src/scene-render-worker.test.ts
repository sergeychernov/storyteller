import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue, StillImageRenderInput } from "@storyteller/render-queue";
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
    spec.onProgress?.(0.5);
    await writeFile(spec.outputPath, "rendered-mp4");
  });

  assert.equal(await worker.runOnce(), true);
  assert.ok(queue.ready?.storageKey.startsWith(sceneRenderStorageKey(renderJob()).slice(0, -4)));
  assert.equal(queue.ready?.contentHash, createHash("sha256").update("rendered-mp4").digest("hex"));
  assert.equal((await readFile(join(root, queue.ready!.storageKey))).toString(), "rendered-mp4");
  assert.deepEqual(queue.progress, [
    { percent: 10, phase: "rendering" },
    { percent: 49, phase: "rendering" },
    { percent: 90, phase: "finalizing" },
    { percent: 94, phase: "uploading" },
    { percent: 99, phase: "finalizing" },
  ]);
});

test("worker downloads every ordered collage source and invokes the collage renderer", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-collage-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/a.jpg", { body: Readable.from("photo-a"), contentType: "image/jpeg", contentLength: 7 });
  await storage.put("source/b.jpg", { body: Readable.from("photo-b"), contentType: "image/jpeg", contentLength: 7 });
  await storage.put("frames/previous.png", { body: Readable.from("previous-frame"), contentType: "image/png", contentLength: 14 });
  const base = renderJob();
  const job: SceneRenderJob = { ...base, inputHash: "collage", input: {
    rendererId: "collage", rendererVersion: 24, layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4, durationSeconds: 5,
    background: {
      source: "previous-scene-frame", treatment: "darkened", sceneId: "previous", inputHash: "frame-input",
      storageKey: "frames/previous.png", contentHash: createHash("sha256").update("previous-frame").digest("hex"),
      name: "previous.png", mimeType: "image/png", width: 1080, height: 1920, orientation: "portrait",
    },
    settings: {
      frame: { width: 12, color: "#FFFFFF", shape: "straight" },
      entryDurationSeconds: 4,
      rowDirection: "ascending",
      straightCards: false,
      cardAngles: [
        { materialId: "a", angleDegrees: -4 },
        { materialId: "b", angleDegrees: 4 },
      ],
      cardOffsets: [{ materialId: "a", offsetY: 0 }, { materialId: "b", offsetY: 0 }],
    },
    materials: [
      { id: "a", kind: "image", storageKey: "source/a.jpg", name: "a.jpg", mimeType: "image/jpeg", width: 800, height: 600,
        orientation: "landscape" },
      { id: "b", kind: "image", storageKey: "source/b.jpg", name: "b.jpg", mimeType: "image/jpeg", width: 800, height: 600,
        orientation: "landscape" },
    ],
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
  } };
  const queue = new MemoryQueue(job);
  let rendered = false;
  const worker = new SceneRenderWorker(
    "worker-1", queue, storage, undefined, undefined, undefined, undefined, undefined,
    async (spec) => {
      rendered = true;
      assert.deepEqual(spec.materials.map(({ id, sourceSize }) => ({ id, sourceSize })), [
        { id: "a", sourceSize: { width: 800, height: 600 } },
        { id: "b", sourceSize: { width: 800, height: 600 } },
      ]);
      assert.match(spec.background!.sourcePath, /background\.png$/u);
      assert.equal((await readFile(spec.background!.sourcePath)).toString(), "previous-frame");
      assert.deepEqual(spec.background!.sourceSize, { width: 1080, height: 1920 });
      assert.equal(spec.background!.treatment, "darkened");
      assert.equal(spec.layoutId, "stack");
      assert.equal(spec.layoutRendererId, "animated-collage.stack.v1");
      assert.equal(spec.settings.frame.width, 12);
      await writeFile(spec.outputPath, "rendered-collage");
    },
  );
  await worker.runOnce();
  assert.equal(rendered, true);
  assert.equal(queue.failed, undefined);
  assert.ok(queue.ready?.storageKey.startsWith(sceneRenderStorageKey(job).slice(0, -4)));
});

test("worker passes PPL video edit metadata into the collage card renderer", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-collage-video-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/video.mp4", { body: Readable.from("video"), contentType: "video/mp4", contentLength: 5 });
  await storage.put("source/portrait.jpg", { body: Readable.from("portrait"), contentType: "image/jpeg", contentLength: 8 });
  await storage.put("source/landscape.jpg", { body: Readable.from("landscape"), contentType: "image/jpeg", contentLength: 9 });
  const base = renderJob();
  const job: SceneRenderJob = { ...base, inputHash: "mixed-collage", input: {
    rendererId: "collage", rendererVersion: 24, layoutId: "2+1",
    layoutRendererId: "animated-collage.two-plus-one.v1", durationSeconds: 5,
    layoutOverlapRatio: 0.4,
    settings: {
      frame: { width: 12, color: "#FFFFFF", shape: "straight" },
      entryDurationSeconds: 4, rowDirection: "ascending", straightCards: false,
      cardAngles: [
        { materialId: "video", angleDegrees: -4 }, { materialId: "portrait", angleDegrees: 4 },
        { materialId: "landscape", angleDegrees: -3 },
      ],
      cardOffsets: [
        { materialId: "video", offsetY: 15 }, { materialId: "portrait", offsetY: -15 },
        { materialId: "landscape", offsetY: 0 },
      ],
    },
    materials: [
      {
        id: "video", kind: "video", storageKey: "source/video.mp4", name: "video.mp4", mimeType: "video/mp4",
        width: 450, height: 800, sourceWidth: 900, sourceHeight: 1600, sourceDurationSeconds: 8,
        orientation: "portrait", edit: {
          rotation: 0, crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, trim: { startSeconds: 1, endSeconds: 4 },
        },
      },
      { id: "portrait", kind: "image", storageKey: "source/portrait.jpg", name: "portrait.jpg", mimeType: "image/jpeg",
        width: 900, height: 1600, orientation: "portrait" },
      { id: "landscape", kind: "image", storageKey: "source/landscape.jpg", name: "landscape.jpg", mimeType: "image/jpeg",
        width: 1600, height: 900, orientation: "landscape" },
    ],
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
  } };
  const queue = new MemoryQueue(job);
  const worker = new SceneRenderWorker(
    "worker-1", queue, storage, undefined, undefined, undefined, undefined, undefined,
    async (spec) => {
      assert.deepEqual(spec.materials[0], {
        id: "video", kind: "video", sourcePath: spec.materials[0]!.sourcePath,
        sourceSize: { width: 900, height: 1600 }, displaySize: { width: 450, height: 800 }, sourceDurationSeconds: 8,
        edit: { rotation: 0, crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, trim: { startSeconds: 1, endSeconds: 4 } },
      });
      assert.match(spec.materials[0]!.sourcePath, /source-0\.mp4$/u);
      await writeFile(spec.outputPath, "rendered-mixed-collage");
    },
  );
  await worker.runOnce();
  assert.equal(queue.failed, undefined);
  assert.ok(queue.ready);
});

test("worker downloads an original video background separately from its collage cards", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-collage-background-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/background.mp4", { body: Readable.from("background-video"), contentType: "video/mp4", contentLength: 16 });
  await storage.put("source/a.jpg", { body: Readable.from("photo-a"), contentType: "image/jpeg", contentLength: 7 });
  await storage.put("source/b.jpg", { body: Readable.from("photo-b"), contentType: "image/jpeg", contentLength: 7 });
  const base = renderJob();
  const job: SceneRenderJob = { ...base, inputHash: "video-background", input: {
    rendererId: "collage", rendererVersion: 24, layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4, durationSeconds: 5,
    background: {
      source: "custom-material", treatment: "original", materialId: "background",
      material: {
        id: "background", kind: "video", storageKey: "source/background.mp4", name: "background.mp4", mimeType: "video/mp4",
        width: 900, height: 1280, sourceWidth: 900, sourceHeight: 1600, sourceDurationSeconds: 8, orientation: "portrait",
        edit: { rotation: 0, crop: { x: 0, y: 0.1, width: 1, height: 0.8 }, trim: { startSeconds: 1, endSeconds: 5 } },
      },
    },
    settings: {
      frame: { width: 12, color: "#FFFFFF", shape: "straight" },
      entryDurationSeconds: 4, rowDirection: "ascending", straightCards: false,
      cardAngles: [{ materialId: "a", angleDegrees: -4 }, { materialId: "b", angleDegrees: 4 }],
      cardOffsets: [{ materialId: "a", offsetY: 0 }, { materialId: "b", offsetY: 0 }],
    },
    materials: [
      { id: "a", kind: "image", storageKey: "source/a.jpg", name: "a.jpg", mimeType: "image/jpeg",
        width: 800, height: 600, orientation: "landscape" },
      { id: "b", kind: "image", storageKey: "source/b.jpg", name: "b.jpg", mimeType: "image/jpeg",
        width: 800, height: 600, orientation: "landscape" },
    ],
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
  } };
  const queue = new MemoryQueue(job);
  const worker = new SceneRenderWorker(
    "worker-1", queue, storage, undefined, undefined, undefined, undefined, undefined,
    async (spec) => {
      assert.deepEqual(spec.materials.map(({ id }) => id), ["a", "b"]);
      assert.equal(spec.background?.kind, "video");
      assert.match(spec.background!.sourcePath, /source-background\.mp4$/u);
      assert.equal((await readFile(spec.background!.sourcePath)).toString(), "background-video");
      assert.deepEqual(spec.background?.sourceSize, { width: 900, height: 1600 });
      assert.equal(spec.background?.edit?.trim?.startSeconds, 1);
      assert.equal(spec.background?.treatment, "original");
      await writeFile(spec.outputPath, "rendered-background-collage");
    },
  );

  await worker.runOnce();
  assert.equal(queue.failed, undefined);
  assert.ok(queue.ready);
});

test("worker stores the final base visual frame separately as lossless PNG", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-frame-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  await storage.put("source/photo.jpg", { body: Readable.from(Buffer.from("photo")), contentType: "image/jpeg", contentLength: 5 });
  const input = { ...renderJob().input, artifact: "scene-frame" as const, frame: {
    rendererVersion: 1, format: "png" as const, compressionLevel: 6,
    intermediateCodec: "h264-lossless" as const, layerPolicy: "base-visual" as const,
  } };
  const job = { ...renderJob(), input, inputHash: "frame-hash" };
  const queue = new MemoryQueue(job);
  const worker = new SceneRenderWorker("worker-1", queue, storage,
    async (spec) => { assert.equal(spec.lossless, true); await writeFile(spec.outputPath, "base-video"); },
    10_000, { info() {}, error() {} }, undefined,
    async (spec) => {
      assert.equal((await readFile(spec.sourcePath)).toString(), "base-video");
      assert.equal(spec.compressionLevel, 6);
      await writeFile(spec.outputPath, "last-frame-png");
    });

  assert.equal(await worker.runOnce(), true);
  assert.match(queue.ready!.storageKey, /\/frames\/frame-hash-.+\.png$/);
  assert.equal(queue.ready?.contentHash, createHash("sha256").update("last-frame-png").digest("hex"));
  assert.equal((await readFile(join(root, queue.ready!.storageKey))).toString(), "last-frame-png");
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
      artifact: "scene-render",
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
  readonly progress: { percent: number; phase: string }[] = [];

  constructor(private readonly job?: SceneRenderJob, private deletion?: ObjectDeletionJob, private readonly completeAccepted = true) {}
  enqueue(): Promise<SceneRenderJob> { throw new Error("not used"); }
  findAuthorized(): Promise<SceneRenderJob | undefined> { return Promise.resolve(undefined); }
  async listAuthorized(): Promise<readonly SceneRenderJob[]> { return []; }
  claim(): Promise<SceneRenderJob | undefined> {
    if (this.claimed) return Promise.resolve(undefined);
    this.claimed = true;
    return Promise.resolve(this.job);
  }
  reportProgress(_renderId: string, _workerId: string, percent: number, phase: Parameters<SceneRenderQueue["reportProgress"]>[3]): Promise<boolean> {
    this.progress.push({ percent, phase });
    return Promise.resolve(true);
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

function renderJob(): SceneRenderJob & { readonly input: StillImageRenderInput } {
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
