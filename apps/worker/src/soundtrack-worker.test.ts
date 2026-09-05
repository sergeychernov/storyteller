import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import type {
  SoundtrackArtifacts, SoundtrackCompletion, SoundtrackProvenance, SoundtrackRenderJob, SoundtrackRenderQueue, SoundtrackRenderPhase,
} from "@storyteller/render-queue";
import type { ObjectStorage, StoredObjectInput } from "@storyteller/storage";
import { copySoundtrackFile, SoundtrackWorker } from "./soundtrack-worker.js";

test("renders, verifies, and stores a preview plus lossless and playable stems", async () => {
  const queue = new MemorySoundtrackQueue(job);
  const storage = new MemoryStorage();
  const worker = new SoundtrackWorker("worker", queue, storage, 1_000, { run: (task) => task() },
    async (_input, write) => write({
      rhythm: Buffer.alloc(1_920), melody: Buffer.alloc(1_920), preview: Buffer.alloc(1_920), sampleFrames: 480,
    }), copySoundtrackFile, copySoundtrackFile,
    async (path) => ({ codec: path.endsWith(".m4a") ? "aac" : "flac", sampleRate: 48_000, channels: 2, durationSeconds: 0.01 }),
    { info() {}, error() {} });
  assert.equal(await worker.runOnce(), true);
  assert.equal(queue.completed?.artifacts.preview.mimeType, "audio/mp4");
  assert.equal(queue.completed?.artifacts.rhythmStem.mimeType, "audio/flac");
  assert.equal(queue.completed?.provenance.externalAudioAssets, false);
  assert.equal(queue.completed?.provenance.sampleFrames, 480);
  assert.equal(queue.completed?.provenance.previewSha256, queue.completed?.artifacts.preview.contentHash);
  assert.equal(queue.completed?.provenance.rhythmStemSha256, queue.completed?.artifacts.rhythmStem.contentHash);
  assert.equal(queue.completed?.provenance.melodyStemSha256, queue.completed?.artifacts.melodyStem.contentHash);
  assert.equal(queue.completed?.provenance.rhythmPreviewSha256, queue.completed?.artifacts.rhythmPreview.contentHash);
  assert.equal(queue.completed?.provenance.melodyPreviewSha256, queue.completed?.artifacts.melodyPreview.contentHash);
  assert.equal(queue.completed?.artifacts.rhythmPreview.mimeType, "audio/mp4");
  assert.equal(queue.completed?.artifacts.melodyPreview.mimeType, "audio/mp4");
  assert.match(queue.completed?.provenance.previewPcmSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(storage.values.size, 5);
  assert.ok(queue.phases.includes("synthesizing"));
  assert.ok(queue.phases.includes("encoding"));
  assert.ok(queue.phases.includes("verifying"));
  assert.ok(queue.phases.includes("uploading"));
});

test("deletes the objects of the soundtrack variants it supersedes", async () => {
  const queue = new MemorySoundtrackQueue(job);
  queue.superseded = ["old/soundtrack.m4a", "old/rhythm.flac"];
  const storage = new MemoryStorage();
  storage.values.set("old/soundtrack.m4a", Buffer.alloc(1));
  storage.values.set("old/rhythm.flac", Buffer.alloc(1));
  const worker = new SoundtrackWorker("worker", queue, storage, 1_000, { run: (task) => task() },
    async (_input, write) => write({
      rhythm: Buffer.alloc(1_920), melody: Buffer.alloc(1_920), preview: Buffer.alloc(1_920), sampleFrames: 480,
    }), copySoundtrackFile, copySoundtrackFile,
    async (path) => ({ codec: path.endsWith(".m4a") ? "aac" : "flac", sampleRate: 48_000, channels: 2, durationSeconds: 0.01 }),
    { info() {}, error() {} });
  assert.equal(await worker.runOnce(), true);
  assert.equal(storage.values.has("old/soundtrack.m4a"), false);
  assert.equal(storage.values.has("old/rhythm.flac"), false);
  assert.equal(storage.values.size, 5);
});

test("reports a bounded failure without retaining partial objects", async () => {
  const queue = new MemorySoundtrackQueue(job);
  const storage = new MemoryStorage();
  const worker = new SoundtrackWorker("worker", queue, storage, 1_000, { run: (task) => task() },
    async () => { throw new Error("synth failed"); }, copySoundtrackFile, copySoundtrackFile,
    async () => ({ codec: "aac", sampleRate: 48_000, channels: 2, durationSeconds: 0.01 }),
    { info() {}, error() {} });
  assert.equal(await worker.runOnce(), true);
  assert.match(queue.failed ?? "", /synth failed/);
  assert.equal(storage.values.size, 0);
});

const job: SoundtrackRenderJob = {
  id: "00000000-0000-4000-8000-000000000001", profileId: "00000000-0000-4000-8000-000000000002",
  storyId: "00000000-0000-4000-8000-000000000003", inputHash: "a".repeat(64), status: "running",
  progressPercent: 1, progressPhase: "synthesizing", createdAt: "2026-09-04T00:00:00.000Z",
  input: {
    version: 1, storyRevision: 1, frameRate: { numerator: 30, denominator: 1 }, totalFrames: 1,
    totalSampleFrames: 480, presetId: "road", presetVersion: 1,
    engineId: "storyteller-procedural", engineVersion: 5, seed: "seed", melodyVariant: 0,
  },
};

class MemorySoundtrackQueue implements SoundtrackRenderQueue {
  claimed = false;
  phases: SoundtrackRenderPhase[] = [];
  failed?: string;
  superseded: string[] = [];
  completed?: { artifacts: SoundtrackArtifacts; provenance: SoundtrackProvenance };
  constructor(private readonly job: SoundtrackRenderJob) {}
  enqueue(): Promise<SoundtrackRenderJob | undefined> { return Promise.resolve(undefined); }
  findCurrentAuthorized(): Promise<SoundtrackRenderJob | undefined> { return Promise.resolve(undefined); }
  findAuthorized(): Promise<SoundtrackRenderJob | undefined> { return Promise.resolve(undefined); }
  claim(): Promise<SoundtrackRenderJob | undefined> {
    if (this.claimed) return Promise.resolve(undefined);
    this.claimed = true;
    return Promise.resolve(this.job);
  }
  reportProgress(_id: string, _worker: string, _percent: number, phase: Exclude<SoundtrackRenderPhase, "queued" | "ready">): Promise<boolean> {
    this.phases.push(phase);
    return Promise.resolve(true);
  }
  complete(_id: string, _worker: string, artifacts: SoundtrackArtifacts, provenance: SoundtrackProvenance): Promise<SoundtrackCompletion> {
    this.completed = { artifacts, provenance };
    return Promise.resolve({ accepted: true, supersededStorageKeys: this.superseded });
  }
  fail(_id: string, _worker: string, error: string): Promise<void> { this.failed = error; return Promise.resolve(); }
}

class MemoryStorage implements ObjectStorage {
  readonly values = new Map<string, Buffer>();
  async put(key: string, input: StoredObjectInput): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.body) chunks.push(Buffer.from(chunk));
    this.values.set(key, Buffer.concat(chunks));
  }
  delete(key: string): Promise<void> { this.values.delete(key); return Promise.resolve(); }
  open(key: string): Promise<Readable> { return Promise.resolve(Readable.from(this.values.get(key) ?? Buffer.alloc(0))); }
}
