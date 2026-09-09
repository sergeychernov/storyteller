import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalObjectStorage, hashFileContent } from "@storyteller/storage";
import {
  storySilentVideoHash, type ClaimedStoryExport, type StoryExportQueue, type StorySilentVideo,
} from "@storyteller/render-queue";
import { SpawnMediaProcessRunner, renderStillImage, renderVideo, probeVideoProfile, assertStoryMasterAudio, assertSegmentProfile, type MediaProcessRunner } from "@storyteller/renderer";
import { StoryExportWorker } from "./story-export-worker.js";

test("real FFmpeg: audio-only rebuilds reuse silent video across worker instances, with and without music", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-master-worker-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  const real = new SpawnMediaProcessRunner();
  let concatenations = 0;
  const runner: MediaProcessRunner = { async run(executable, args, ...rest) {
    if (executable === "ffmpeg" && args.includes("concat")) concatenations++;
    return real.run(executable, args, ...rest);
  } };
  const image = join(root, "source.png");
  const created = await real.run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=red:s=16x16", "-frames:v", "1", image]);
  assert.equal(created.exitCode, 0, created.stderr);
  const frameRate = { numerator: 30, denominator: 1 };
  const segmentPath = join(root, "segment.mp4");
  await renderStillImage({ sourcePath: image, outputPath: segmentPath, sourceSize: { width: 16, height: 16 },
    orientation: "landscape", durationSeconds: 1, durationFrames: 30, frameRate, motion: "none" }, real);
  const music = join(root, "music.flac");
  const tone = await real.run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-ac", "2", music]);
  assert.equal(tone.exitCode, 0, tone.stderr);
  const stem = { storageKey: "music.flac", contentHash: await hashFileContent(music) };
  const input = { artifact: "story-export-segment", rendererId: "still-image", rendererVersion: 1,
    material: { storageKey: "source.png", name: "source.png", mimeType: "image/png", width: 16, height: 16, orientation: "landscape" },
    output: { width: 1080, height: 1920, fps: 30, codec: "h264", profileId: "vertical-social-v1", frameRate, durationFrames: 30 },
    durationSeconds: 1, motion: "none", focusPoint: { x: 0.5, y: 0.5 } } as const;
  const sourceAudio = join(root, "source.m4a");
  const edit = { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } } as const;
  await renderVideo({ audioPath: music, outputPath: sourceAudio, sourceSize: { width: 16, height: 16 },
    sourceDurationSeconds: 1, hasAudio: true, mode: "audio", edit, frameRate, durationFrames: 30 }, real);
  const audioInput = { ...input, rendererId: "video", mode: "audio", hasAudio: true, sourceDurationSeconds: 1, edit } as const;
  let job: ClaimedStoryExport = {
    id: "one", profileId: "profile", storyId: "story", manifestHash: "first", status: "assembling", progressPercent: 90,
    progressPhase: "assembling", readySegments: 1, totalSegments: 1, createdAt: new Date().toISOString(),
    manifest: { version: 3, storyRevision: 1, timelineHash: "timeline", outputProfileId: "vertical-social-v1", frameRate,
      totalFrames: 30, levels: { video: 1, rhythm: 0, melody: 0.5, duckedMelody: 0.3 },
      soundtrack: { renderId: "music", rhythm: stem, melody: stem },
      audioSegments: [{ position: 0, sceneId: "scene", durationFrames: 30, inputHash: "source-audio", input: audioInput }],
      segments: [{ position: 0, sceneId: "scene", durationFrames: 30, inputHash: "visual-one", input }] },
    segments: [{ id: "render", sceneId: "scene", input, storageKey: "segment.mp4", contentHash: await hashFileContent(segmentPath) }],
    audioSegments: [{ id: "audio", sceneId: "scene", input: audioInput, storageKey: "source.m4a", contentHash: await hashFileContent(sourceAudio) }],
  };
  const cache = new Map<string, StorySilentVideo>();
  const outputs: string[] = [];
  const queue = {
    async claimAssembly() { return job; },
    async findSilentVideo() { return cache.get(storySilentVideoHash(job.manifest)); },
    async saveSilentVideo(_id: string, _worker: string, video: StorySilentVideo) { cache.set(storySilentVideoHash(job.manifest), video); return true; },
    async reportAssemblyProgress() { return true; },
    async complete(_id: string, _worker: string, key: string) { outputs.push(key); return true; },
    async fail(_id: string, _worker: string, _code: string, error: string) { assert.fail(error); },
  } as unknown as StoryExportQueue;
  await new StoryExportWorker("first", queue, storage, undefined, undefined, runner).runOnce();
  assert.equal(concatenations, 1);
  const firstHash = storySilentVideoHash(job.manifest);
  job = { ...job, id: "two", manifestHash: "second", manifest: { ...job.manifest, levels: { ...job.manifest.levels, melody: 0.1 } } };
  assert.equal(storySilentVideoHash(job.manifest), firstHash);
  // If the worker tries to fetch any visual segment, this rebuild fails.
  await storage.delete("segment.mp4");
  await new StoryExportWorker("second", queue, storage, undefined, undefined, runner).runOnce();
  assert.equal(concatenations, 1);
  const { soundtrack: _music, ...withoutMusic } = job.manifest;
  job = { ...job, id: "three", manifestHash: "third", manifest: withoutMusic };
  await new StoryExportWorker("third", queue, storage, undefined, undefined, runner).runOnce();
  assert.equal(concatenations, 1);
  assert.equal(outputs.length, 3);
  for (const key of outputs) {
    const path = join(root, key);
    const { audioCodec: _codec, audioSampleRate: _rate, audioChannels: _channels, ...profile } = await probeVideoProfile(path, real);
    assertSegmentProfile(profile, frameRate, 30);
    await assertStoryMasterAudio(path, 30, frameRate, real);
    const result = await real.run("ffprobe", ["-v", "error", "-show_entries", "stream=duration", "-of", "json", path]);
    for (const stream of JSON.parse(result.stdout).streams) assert.equal(Number(stream.duration), 1);
    assert.equal((await real.run("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"])).exitCode, 0);
    const volume = await real.run("ffmpeg", ["-v", "info", "-i", path, "-af", "volumedetect", "-f", "null", "-"]);
    assert.ok(Number(/max_volume: (-?\d+(?:\.\d+)?) dB/.exec(volume.stderr)?.[1]) > -40,
      "the scene's own sound must survive even with no music");
  }
  assert.notEqual(storySilentVideoHash({ ...job.manifest, segments: [{ ...job.manifest.segments[0]!, inputHash: "changed" }] }), firstHash);
  assert.notEqual(storySilentVideoHash({ ...job.manifest, frameRate: { numerator: 24, denominator: 1 } }), firstHash);
});
