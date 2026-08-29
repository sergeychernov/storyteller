import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStillImageMotionPlan } from "@storyteller/domain";
import { buildStillImageFilter, PcmWaveform, prepareVideoAudio, probeMedia, renderLastFrame, renderStillImage, renderVideo, SpawnMediaProcessRunner, type MediaProcessRunner } from "./index.js";

test("probeMedia uses an argument array and parses JSON", async () => {
  let received: readonly string[] = [];
  const runner: MediaProcessRunner = {
    async run(executable, args) {
      assert.equal(executable, "ffprobe");
      received = args;
      return { exitCode: 0, stdout: '{"streams":[]}', stderr: "" };
    },
  };
  assert.deepEqual(await probeMedia("clip with spaces.mp4", runner), { streams: [] });
  assert.equal(received.at(-1), "clip with spaces.mp4");
});

test("audio processing preserves delayed sound and nonzero source timestamps, including silence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-audio-alignment-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SpawnMediaProcessRunner();
  async function ffmpeg(args: string[]) {
    const result = await runner.run("ffmpeg", ["-y", "-v", "error", ...args]);
    assert.equal(result.exitCode, 0, result.stderr);
  }
  const source = join(root, "delayed.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=s=32x32:r=10:d=3", "-itsoffset", "0.75",
    "-f", "lavfi", "-i", "sine=f=440:r=44100:d=1.5", "-c:v", "libx264", "-c:a", "aac", "-output_ts_offset", "5", source]);
  const audio = join(root, "audio.m4a");
  const metadata = await prepareVideoAudio(source, audio, runner);
  assert.ok(metadata.durationSeconds > 2.2 && metadata.durationSeconds < 2.3, JSON.stringify(metadata));
  const pcmPath = join(root, "audio.pcm");
  await ffmpeg(["-i", audio, "-ac", "1", "-ar", "48000", "-f", "s16le", pcmPath]);
  const pcm = await readFile(pcmPath);
  const rms = (from: number, to: number) => {
    let sum = 0;
    for (let i = Math.round(from * 48000); i < Math.round(to * 48000); i++) sum += pcm.readInt16LE(i * 2) ** 2;
    return Math.sqrt(sum / ((to - from) * 48000));
  };
  assert.ok(rms(0, 0.6) < 5, "leading silence must preserve the sound's original offset");
  assert.ok(rms(0.9, 1.1) > 100, "the beginning of the sound must remain audible");
  assert.ok(rms(2, 2.15) > 100, "the end of the sound must remain audible");
  const exported = join(root, "selected.m4a");
  await renderVideo({ audioPath: audio, outputPath: exported, sourceSize: { width: 32, height: 32 },
    sourceDurationSeconds: 3, hasAudio: true, mode: "audio",
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0.5, endSeconds: 3 } } }, runner);
  const exportProbe = await probeMedia(exported, runner) as { format: { duration: string } };
  assert.ok(Math.abs(Number(exportProbe.format.duration) - 2.5) < 0.03, "audio exports pad a short track without shortening the selected range");
  const legacyOutput = join(root, "legacy.mp4");
  await renderVideo({ sourcePath: source, outputPath: legacyOutput, sourceSize: { width: 32, height: 32 },
    sourceDurationSeconds: 3, hasAudio: true, mode: "combined",
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0.5, endSeconds: 2.5 } } }, runner);
  const legacyProbe = await probeMedia(legacyOutput, runner) as { streams: { codec_type: string; duration: string; start_time: string }[] };
  assert.deepEqual(legacyProbe.streams.map((stream) => stream.codec_type), ["video", "audio"]);
  for (const stream of legacyProbe.streams) {
    assert.ok(Math.abs(Number(stream.duration) - 2) < 0.03);
    assert.ok(Math.abs(Number(stream.start_time)) < 0.03);
  }
  const silentTail = join(root, "tail.m4a");
  await renderVideo({ audioPath: audio, outputPath: silentTail, sourceSize: { width: 32, height: 32 },
    sourceDurationSeconds: 3, hasAudio: true, mode: "audio",
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 2.7, endSeconds: 3 } } }, runner);
  const tailProbe = await probeMedia(silentTail, runner) as { format: { duration: string } };
  assert.ok(Math.abs(Number(tailProbe.format.duration) - 0.3) < 0.03, "a selection after the audio ends must export silence");
  const silent = join(root, "silent.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=s=32x32:r=10:d=0.5", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=0.5",
    "-c:v", "libx264", "-c:a", "aac", silent]);
  const silence = await prepareVideoAudio(silent, join(root, "silent.m4a"), runner);
  assert.equal(silence.processing.integratedLufs, null);
  assert.equal(silence.processing.truePeakDbfs, null);
  assert.ok(Math.abs(silence.durationSeconds - 0.5) < 0.03);
});

test("waveform normalizes both channels without cancelling opposite phases", () => {
  const pcm = Buffer.alloc(16);
  for (const [index, sample] of [100, 200, 400, 800].entries()) {
    pcm.writeInt16LE(sample, index * 4);
    pcm.writeInt16LE(-sample, index * 4 + 2);
  }
  const waveform = new PcmWaveform(4, 4);
  waveform.add(pcm.subarray(0, 5));
  waveform.add(pcm.subarray(5, 11));
  waveform.add(pcm.subarray(11));
  assert.deepEqual(waveform.normalized(), [0.125, 0.25, 0.5, 1]);
});

test("waveform preserves silence and ignores audio beyond the video", () => {
  const silent = new PcmWaveform(4, 4);
  silent.add(Buffer.alloc(8));
  assert.deepEqual(silent.normalized(), [0, 0, 0, 0]);
  const clipped = new PcmWaveform(2, 2);
  const pcm = Buffer.alloc(12);
  pcm.writeInt16LE(100, 0);
  pcm.writeInt16LE(200, 4);
  pcm.writeInt16LE(30_000, 8);
  clipped.add(pcm);
  assert.deepEqual(clipped.normalized(), [0.5, 1]);
  assert.throws(() => new PcmWaveform(0), /positive/);
});

test("landscape stills cross the full crop and dwell when the focus is centered", () => {
  const rightFilter = buildStillImageFilter({
    sourcePath: "wide.jpg", outputPath: "wide.mp4", sourceSize: { width: 1920, height: 1080 },
    orientation: "landscape", durationSeconds: 6,
    motion: "pan-right", focusPoint: { x: 0.3, y: 0.5 },
  });
  const leftFilter = buildStillImageFilter({
    sourcePath: "wide.jpg", outputPath: "wide.mp4", sourceSize: { width: 1920, height: 1080 },
    orientation: "landscape", durationSeconds: 6,
    motion: "pan-left", focusPoint: { x: 0.3, y: 0.5 },
  });
  const rightPlan = createStillImageMotionPlan({
    sourceSize: { width: 1920, height: 1080 }, frameSize: { width: 1080, height: 1920 },
    orientation: "landscape", motion: "pan-right", focusPoint: { x: 0.3, y: 0.5 },
  });
  const leftPlan = createStillImageMotionPlan({
    sourceSize: { width: 1920, height: 1080 }, frameSize: { width: 1080, height: 1920 },
    orientation: "landscape", motion: "pan-left", focusPoint: { x: 0.3, y: 0.5 },
  });
  assert.equal(rightPlan.kind, "pan");
  assert.equal(leftPlan.kind, "pan");
  assert.match(rightFilter, /scale=1080:1920:force_original_aspect_ratio=increase/);
  assert.ok(rightFilter.includes(`if(lte(t/6.000\\,${rightPlan.easing.at.toFixed(6)})`));
  assert.ok(leftFilter.includes(`if(lte(t/6.000\\,${leftPlan.easing.at.toFixed(6)})`));
  assert.ok(rightFilter.includes("(iw-ow)*clip(0.000+1.000*if("));
  assert.ok(leftFilter.includes("(iw-ow)*clip(1.000-1.000*if("));
  assert.match(rightFilter, /1\.550/);
  assert.match(rightFilter, /0\.450/);
  assert.throws(() => buildStillImageFilter({
    sourcePath: "wide.jpg", outputPath: "wide.mp4", sourceSize: { width: 1920, height: 1080 },
    orientation: "landscape", durationSeconds: 6, motion: "zoom-in",
  }), /not valid/);
});

test("portrait stills zoom around the selected focus at minimum cover scale", async () => {
  const calls: { executable: string; args: readonly string[] }[] = [];
  const runner: MediaProcessRunner = {
    async run(executable, args) {
      calls.push({ executable, args });
      return executable === "ffmpeg"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 0, stdout: '{"streams":[],"format":{"duration":"4"}}', stderr: "" };
    },
  };
  await renderStillImage({
    sourcePath: "portrait.jpg", outputPath: "portrait.mp4", sourceSize: { width: 1080, height: 1920 },
    orientation: "portrait", durationSeconds: 4,
    motion: "zoom-out", focusPoint: { x: 0.25, y: 0.7 },
  }, runner);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.executable, "ffmpeg");
  assert.equal(calls[0]?.args[0], "-n");
  assert.deepEqual(calls[0]?.args.slice(calls[0].args.indexOf("-filter_threads"), calls[0].args.indexOf("-filter_threads") + 2), ["-filter_threads", "2"]);
  assert.deepEqual(calls[0]?.args.slice(calls[0].args.indexOf("-filter_complex_threads"), calls[0].args.indexOf("-filter_complex_threads") + 2), ["-filter_complex_threads", "2"]);
  assert.deepEqual(calls[0]?.args.slice(calls[0].args.indexOf("-threads"), calls[0].args.indexOf("-threads") + 2), ["-threads", "2"]);
  const filter = calls[0]?.args[calls[0].args.indexOf("-filter_complex") + 1] ?? "";
  assert.match(filter, /scale=2160:3840/);
  assert.match(filter, /zoompan=z='1\.130-0\.130/);
  assert.match(filter, /iw\*0\.250/);
  assert.match(filter, /ih\*0\.700/);
  assert.equal(calls[0]?.args.at(-1), "portrait.mp4");
});

test("reports the signal when ffmpeg is killed by the container", async () => {
  const runner: MediaProcessRunner = {
    run: () => Promise.resolve({ exitCode: null, signal: "SIGKILL", stdout: "", stderr: "" }),
  };
  await assert.rejects(renderStillImage({
    sourcePath: "wide.jpg", outputPath: "wide.mp4", sourceSize: { width: 3648, height: 2736 },
    orientation: "landscape", durationSeconds: 3, motion: "pan-left",
  }, runner), /ffmpeg failed \(signal SIGKILL\)/);
});

test("extracts the final decoded frame into one lossless PNG", async () => {
  const calls: { executable: string; args: readonly string[] }[] = [];
  await renderLastFrame({ sourcePath: "base.mp4", outputPath: "frame.png", compressionLevel: 6 }, {
    async run(executable, received) {
      calls.push({ executable, args: received });
      return executable === "ffprobe"
        ? { exitCode: 0, stdout: '{"streams":[{"codec_type":"video","nb_frames":"4"}]}', stderr: "" }
        : { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(calls[0]?.executable, "ffprobe");
  assert.deepEqual(calls[1]?.args, [
    "-y", "-v", "error", "-i", "base.mp4", "-map", "0:v:0", "-an", "-map_metadata", "-1",
    "-vf", "select=eq(n\\,3)", "-frames:v", "1", "-compression_level", "6", "frame.png",
  ]);
  await assert.rejects(renderLastFrame({ sourcePath: "base.mp4", outputPath: "frame.png", compressionLevel: 10 }, {
    run: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
  }), /compression level/);
  await assert.rejects(renderLastFrame({ sourcePath: "base.mp4", outputPath: "frame.png" }, {
    run: (executable) => Promise.resolve(executable === "ffprobe"
      ? { exitCode: 0, stdout: '{"streams":[{"codec_type":"video"}]}', stderr: "" }
      : { exitCode: 0, stdout: "", stderr: "" }),
  }), /indexed video frames/);
});

test("scene-frame intermediates use lossless H.264 instead of CRF compression", async () => {
  const calls: string[][] = [];
  const runner: MediaProcessRunner = {
    async run(executable, args) {
      if (executable === "ffmpeg") calls.push([...args]);
      return executable === "ffprobe"
        ? { exitCode: 0, stdout: '{"streams":[],"format":{"duration":"3"}}', stderr: "" }
        : { exitCode: 0, stdout: "", stderr: "" };
    },
  };
  await renderStillImage({
    sourcePath: "photo.png", outputPath: "base.mp4", sourceSize: { width: 100, height: 200 },
    orientation: "portrait", durationSeconds: 3, motion: "none", lossless: true,
  }, runner);
  await renderVideo({
    sourcePath: "clip.mp4", outputPath: "base-video.mp4", sourceSize: { width: 100, height: 200 },
    sourceDurationSeconds: 3, hasAudio: false, mode: "video", lossless: true,
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
  }, runner);
  for (const args of calls) {
    assert.deepEqual(args.slice(args.indexOf("-preset"), args.indexOf("-preset") + 4), ["-preset", "ultrafast", "-qp", "0"]);
    assert.equal(args.includes("-crf"), false);
  }
});

test("lossless scene frame contains the actual last frame rather than the first", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-last-frame-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SpawnMediaProcessRunner();
  const video = join(root, "red-then-blue.mp4");
  const create = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-f", "lavfi", "-i", "color=red:s=16x16:r=2:d=1",
    "-f", "lavfi", "-i", "color=blue:s=16x16:r=2:d=1",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", video,
  ]);
  assert.equal(create.exitCode, 0, create.stderr);
  const frame = join(root, "frame.png");
  await renderLastFrame({ sourcePath: video, outputPath: frame }, runner);
  const pixel = join(root, "pixel.rgb");
  const decode = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", frame, "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", pixel,
  ]);
  assert.equal(decode.exitCode, 0, decode.stderr);
  const [red = 0, _green = 0, blue = 0] = await readFile(pixel);
  assert.ok(blue > red * 3, `expected the final blue frame, received rgb(${red},${_green},${blue})`);
});
