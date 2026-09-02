import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCollageEntranceSchedule, createStillImageMotionPlan, getCollageCardShadowMetrics,
} from "@storyteller/domain";
import {
  buildCollageBackgroundFilter, buildCollageCardFilter, buildCollageFilter, buildStillImageFilter, PcmWaveform, prepareVideoAudio, probeMedia, renderCollage,
  assembleStoryMaster, assertApprovedStoryMix, assertSegmentProfile, probeVideoProfile, renderLastFrame, renderStillImage, renderVideo, SpawnMediaProcessRunner, type MediaProcessRunner,
} from "./index.js";

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

test("SpawnMediaProcessRunner reports FFmpeg timestamp progress", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-ffmpeg-progress-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const progress: number[] = [];
  const result = await new SpawnMediaProcessRunner().run("ffmpeg", [
    "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=10", "-t", "0.5",
    "-c:v", "libx264", join(root, "progress.mp4"),
  ], undefined, { durationSeconds: 0.5, onProgress: (value) => progress.push(value) });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.ok(progress.length > 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]!));
});

test("collage renderer preserves full photo aspects, paper frame, rotation and eased sequential timing", async () => {
  const settings = {
    frame: { width: 12 as const, color: "#AABBCC", shape: "torn" as const },
    entryDurationSeconds: 4,
    rowDirection: "ascending" as const,
    straightCards: false,
    cardAngles: [
      { materialId: "a", angleDegrees: -4.5 },
      { materialId: "b", angleDegrees: 6.25 },
    ],
    cardOffsets: [{ materialId: "a", offsetY: 0 }, { materialId: "b", offsetY: 0 }],
  };
  const spec = {
    materials: [
      { id: "a", kind: "image" as const, sourcePath: "a.jpg", sourceSize: { width: 1200, height: 800 } },
      { id: "b", kind: "image" as const, sourcePath: "b.jpg", sourceSize: { width: 1200, height: 800 } },
    ],
    outputPath: "collage.mp4", layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4, settings, durationSeconds: 5,
  };
  const cardFilter = buildCollageCardFilter(spec, 0);
  const backgroundFilter = buildCollageBackgroundFilter(spec);
  const filter = buildCollageFilter(spec);
  assert.match(backgroundFilter, /force_original_aspect_ratio=increase/);
  assert.match(backgroundFilter, /crop=1080:1920:\(iw-ow\)\/2:\(ih-oh\)\/2/);
  assert.match(backgroundFilter, /eq=brightness=-0\.400:saturation=0\.720/);
  assert.match(cardFilter, /force_original_aspect_ratio=decrease/);
  assert.doesNotMatch(cardFilter, /crop=/);
  assert.match(cardFilter, /color=c=0xAABBCC/);
  assert.match(cardFilter, /geq=.*sin/);
  assert.match(cardFilter, /floor\(X\/9\)/);
  assert.match(cardFilter, /mod\(X\\,9\)\/9/);
  assert.match(cardFilter, /\[photo\]null\[photo-shape\]/);
  assert.match(cardFilter, /\[frame\]\[photo-shape\]overlay/);
  assert.match(cardFilter, /\[inner-frame-base\]geq=.*floor\(X\/18\).*\[inner-frame\]/);
  assert.match(cardFilter, /\[inner-frame-base\]geq=.*a='if\(.*,0,alpha\(X,Y\)\)'\[inner-frame\]/);
  assert.match(cardFilter, /\[card-photo\]\[inner-frame\]overlay/);
  assert.doesNotMatch(cardFilter, /\/2\.7/);
  assert.doesNotMatch(filter, /geq=|force_original_aspect_ratio/,
    "the expensive static paper contour must not be recalculated for every video frame");
  assert.match(filter, /rotate=angle=/);
  assert.match(filter, /:c=0x00000000/);
  assert.match(filter, /\[card-rotated0\]split=2/);
  assert.match(filter, /colorchannelmixer=rr=0:gg=0:bb=0:aa=0\.400/);
  assert.match(filter, /boxblur=lr=0:lp=1:cr=0:cp=1:ar=21:ap=2/);
  assert.ok(filter.indexOf("[card-shape0]rotate") < filter.indexOf("[card-shadow-source0]pad"),
    "the shadow must be generated from the cropped and rotated alpha silhouette");
  assert.match(filter, /pow\(1-/);
  assert.match(filter, /-0\.07853982/);
  assert.match(filter, /0\.10908308/);
  assert.match(filter, /enable='gte\(t,3\.300\)'/);
  const entrance = createCollageEntranceSchedule({
    layoutId: spec.layoutId,
    layoutRendererId: spec.layoutRendererId,
    layoutOverlapRatio: spec.layoutOverlapRatio,
    materials: spec.materials.map(({ id, kind, sourceSize }) => ({ id, kind, ...sourceSize })),
    width: 1080,
    height: 1920,
    settings,
  })[0]!;
  const maximumAngle = Math.max(Math.abs(entrance.startAngleDegrees), Math.abs(entrance.finalAngleDegrees));
  const radians = maximumAngle * Math.PI / 180;
  const rotatedHeight = Math.max(entrance.height, Math.ceil(
    entrance.width * Math.abs(Math.sin(radians)) + entrance.height * Math.abs(Math.cos(radians)),
  ));
  const initialOverlayY = entrance.y - Math.ceil((rotatedHeight - entrance.height) / 2)
    - getCollageCardShadowMetrics(1080).padding + entrance.startOffsetY;
  assert.ok(initialOverlayY > 1920, "the FFmpeg card must start fully below the scene");
  assert.ok(filter.includes(`if(lt(t\\,0.000)\\,${initialOverlayY}\\,`), "FFmpeg must use the shared off-stage offset");
  const withoutFrame = buildCollageCardFilter({
    ...spec,
    settings: { ...settings, frame: { width: 16, color: "#AABBCC", shape: "none" } },
  }, 0);
  assert.doesNotMatch(withoutFrame, /\[frame\]|\[inner-frame\]|color=c=0xAABBCC/);
  assert.match(withoutFrame, /\[photo-shape\]null\[card-base\]/);
  const ascendingMaterials = Array.from({ length: 6 }, (_, index) => ({
    id: `p${index}`, kind: "image" as const, sourcePath: `p${index}.jpg`, sourceSize: { width: 900, height: 1600 },
  }));
  const ascending = buildCollageFilter({
    ...spec,
    materials: ascendingMaterials,
    layoutId: "portrait-pairs-ascending",
    layoutRendererId: "animated-collage.portrait-pairs-ascending.v1",
    settings: {
      ...settings,
      frame: { width: 12, color: "#AABBCC", shape: "straight" },
      straightCards: true,
      cardAngles: ascendingMaterials.map(({ id }) => ({ materialId: id, angleDegrees: 0 })),
      cardOffsets: ascendingMaterials.map(({ id }, index) => ({ materialId: id, offsetY: index % 2 === 0 ? 15 : -15 })),
    },
  });
  assert.deepEqual([...ascending.matchAll(/\[base\d+\]\[card(\d+)\]overlay/gu)].map((match) => Number(match[1])),
    [4, 5, 2, 3, 0, 1]);
  const rowDescending = buildCollageFilter({
    ...spec,
    materials: ascendingMaterials,
    layoutId: "portrait-pairs-ascending",
    layoutRendererId: "animated-collage.portrait-pairs-ascending.v1",
    settings: {
      ...settings,
      rowDirection: "descending",
      frame: { width: 12, color: "#AABBCC", shape: "straight" },
      straightCards: true,
      cardAngles: ascendingMaterials.map(({ id }) => ({ materialId: id, angleDegrees: 0 })),
      cardOffsets: ascendingMaterials.map(({ id }, index) => ({ materialId: id, offsetY: index % 2 === 0 ? -15 : 15 })),
    },
  });
  assert.notEqual(rowDescending, ascending, "FFmpeg must consume the shared vertical row direction schedule");
  assert.throws(() => buildCollageFilter({ ...spec, layoutRendererId: "animated-collage.stack.v2" }), /renderer does not match/);
  assert.throws(() => buildCollageFilter({ ...spec, layoutOverlapRatio: 0.3 }), /layout overlap does not match/);
  assert.doesNotThrow(() => buildCollageFilter({
    ...spec,
    materials: [{ ...spec.materials[0]!, kind: "video" }, spec.materials[1]!],
  }));

  const calls: { executable: string; args: readonly string[] }[] = [];
  await renderCollage(spec, {
    async run(executable, args) {
      calls.push({ executable, args });
      return executable === "ffmpeg"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 0, stdout: '{"streams":[{"codec_type":"video"}]}', stderr: "" };
    },
  });
  const ffmpegCalls = calls.filter(({ executable }) => executable === "ffmpeg");
  assert.equal(ffmpegCalls.length, 4);
  assert.ok(ffmpegCalls[0]?.args.includes("[background]"));
  assert.ok(ffmpegCalls.slice(1, 3).every(({ args }) => args.includes("[card]") && args.includes("-frames:v")));
  const animationCall = ffmpegCalls.find(({ args }) => args.at(-1) === "collage.mp4");
  assert.ok(animationCall);
  assert.deepEqual(animationCall.args.filter((argument) => argument === "-loop"), ["-loop", "-loop", "-loop"]);

  const videoCalls: { executable: string; args: readonly string[] }[] = [];
  const videoSpec = {
    ...spec,
    outputPath: "collage-video.mp4",
    materials: [{ ...spec.materials[0]!, kind: "video" as const, sourceDurationSeconds: 1 }, spec.materials[1]!],
  };
  await renderCollage(videoSpec, {
    async run(executable, args) {
      videoCalls.push({ executable, args });
      return executable === "ffmpeg"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 0, stdout: '{"streams":[{"codec_type":"video"}]}', stderr: "" };
    },
  });
  const videoAnimation = videoCalls.find(({ executable, args }) => executable === "ffmpeg" && args.at(-1) === "collage-video.mp4")!;
  const videoCardInput = videoAnimation.args.indexOf(".collage-card-0.mkv");
  assert.equal(videoAnimation.args[videoCardInput - 1], "-i");
  assert.notEqual(videoAnimation.args[videoCardInput - 3], "-stream_loop",
    "a video card must be decoded once instead of restarting after EOF");
  assert.match(buildCollageFilter(videoSpec), /tpad=stop_mode=clone:stop_duration=5\.000,trim=duration=5\.000/,
    "the last decoded video-card frame must remain visible for the rest of the scene");
});

test("collage renderer consumes the fitted schedule for a square final crop in two-plus-one", () => {
  const materials = [
    { id: "left", kind: "image" as const, sourcePath: "left.jpg", sourceSize: { width: 900, height: 1600 } },
    { id: "right", kind: "image" as const, sourcePath: "right.jpg", sourceSize: { width: 900, height: 1600 } },
    {
      id: "square", kind: "image" as const, sourcePath: "square.jpg",
      sourceSize: { width: 1600, height: 900 }, displaySize: { width: 900, height: 900 },
    },
  ];
  const settings = {
    frame: { width: 12 as const, color: "#FFFFFF", shape: "straight" as const },
    entryDurationSeconds: 4,
    rowDirection: "ascending" as const,
    straightCards: false,
    cardAngles: [
      { materialId: "left", angleDegrees: -4 },
      { materialId: "right", angleDegrees: 4 },
      { materialId: "square", angleDegrees: 5.4208 },
    ],
    cardOffsets: [
      { materialId: "left", offsetY: 20 },
      { materialId: "right", offsetY: -20 },
      { materialId: "square", offsetY: 0 },
    ],
  };
  const spec = {
    materials, settings, durationSeconds: 5, outputPath: "square-crop.mp4",
    layoutId: "2+1", layoutRendererId: "animated-collage.two-plus-one.v1", layoutOverlapRatio: 0.4,
  };
  const card = createCollageEntranceSchedule({
    layoutId: spec.layoutId,
    layoutRendererId: spec.layoutRendererId,
    layoutOverlapRatio: spec.layoutOverlapRatio,
    materials: materials.map(({ id, kind, sourceSize, displaySize }) => ({ id, kind, ...(displaySize ?? sourceSize) })),
    width: 1080,
    height: 1920,
    settings,
  })[2]!;

  assert.doesNotThrow(() => buildCollageFilter(spec));
  assert.match(buildCollageCardFilter(spec, 2), new RegExp(`scale=${card.width - 24}:${card.height - 24}`));
});

test("a non-PPL collage keeps trimmed video moving inside a framed card", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-collage-video-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SpawnMediaProcessRunner();
  const video = join(root, "video.mp4");
  const landscape = join(root, "landscape.png");
  const output = join(root, "mixed.mp4");
  const createdVideo = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=80x40:r=5:d=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", video,
  ]);
  assert.equal(createdVideo.exitCode, 0, createdVideo.stderr);
  for (const [path, color, size] of [[landscape, "blue", "80x40"]] as const) {
    const created = await runner.run("ffmpeg", [
      "-y", "-v", "error", "-f", "lavfi", "-i", `color=${color}:s=${size}:d=0.1`,
      "-frames:v", "1", "-update", "1", path,
    ]);
    assert.equal(created.exitCode, 0, created.stderr);
  }
  const materials = [
    {
      id: "video", kind: "video" as const, sourcePath: video,
      sourceSize: { width: 80, height: 40 }, displaySize: { width: 80, height: 40 }, sourceDurationSeconds: 1,
      edit: { rotation: 0 as const, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0.2, endSeconds: 0.8 } },
    },
    { id: "landscape", kind: "image" as const, sourcePath: landscape, sourceSize: { width: 80, height: 40 } },
  ];
  const settings = {
    frame: { width: 12 as const, color: "#FFFFFF", shape: "torn" as const },
    entryDurationSeconds: 0.5,
    rowDirection: "ascending" as const,
    straightCards: false,
    cardAngles: [
      { materialId: "video", angleDegrees: -4 },
      { materialId: "landscape", angleDegrees: 4 },
    ],
    cardOffsets: [{ materialId: "video", offsetY: 0 }, { materialId: "landscape", offsetY: 0 }],
  };
  const spec = {
    materials, outputPath: output, layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4,
    settings, durationSeconds: 1.5, width: 180, height: 320, fps: 5, overwrite: true,
  };
  const videoCardFilter = buildCollageCardFilter(spec, 0);
  const animationFilter = buildCollageFilter(spec);
  assert.match(animationFilter, /\[0:v\].*tpad=stop_mode=clone/,
    "a custom video background must hold its final frame instead of looping");
  assert.match(videoCardFilter, /crop=80:40:0:0/);
  assert.match(videoCardFilter, /force_original_aspect_ratio=decrease/);
  assert.match(animationFilter, /\[1:v\].*tpad=stop_mode=clone:stop_duration=1\.500,trim=duration=1\.500/);
  assert.doesNotMatch(animationFilter, /\[2:v\].*tpad=/,
    "a static image remains a looped input and does not need video EOF padding");
  await renderCollage(spec, runner);

  for (const index of [0]) {
    const card = join(root, `.collage-card-${index}.mkv`);
    const hashes = await runner.run("ffmpeg", ["-v", "error", "-i", card, "-map", "0:v:0", "-f", "framemd5", "-"]);
    assert.equal(hashes.exitCode, 0, hashes.stderr);
    const distinctFrames = new Set(hashes.stdout.split("\n").filter((line) => /^\d/u.test(line)).map((line) => line.split(",").at(-1)?.trim()));
    assert.ok(distinctFrames.size > 1, `prepared card ${index} must retain video frame changes`);
  }
  const metadata = await probeMedia(output, runner) as {
    streams: { codec_type: string; codec_name: string; pix_fmt: string; width: number; height: number }[];
    format: { duration: string };
  };
  assert.deepEqual(metadata.streams.map(({ codec_type }) => codec_type), ["video"]);
  assert.deepEqual(metadata.streams.map(({ codec_name, pix_fmt, width, height }) => ({ codec_name, pix_fmt, width, height })), [
    { codec_name: "h264", pix_fmt: "yuv420p", width: 180, height: 320 },
  ]);
  assert.equal(Number(metadata.format.duration), 1.6);

  const backgroundOutput = join(root, "video-background.mp4");
  const backgroundSpec = {
    background: {
      treatment: "original" as const,
      kind: "video" as const, sourcePath: video, sourceSize: { width: 80, height: 40 }, sourceDurationSeconds: 1,
      edit: { rotation: 0 as const, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0.2, endSeconds: 0.8 } },
    },
    materials: [
      { id: "left", kind: "image" as const, sourcePath: landscape, sourceSize: { width: 80, height: 40 } },
      { id: "right", kind: "image" as const, sourcePath: landscape, sourceSize: { width: 80, height: 40 } },
    ],
    outputPath: backgroundOutput, layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4,
    settings: {
      frame: { width: 12 as const, color: "#FFFFFF", shape: "straight" as const },
      entryDurationSeconds: 0.5, rowDirection: "ascending" as const, straightCards: false,
      cardAngles: [{ materialId: "left", angleDegrees: -4 }, { materialId: "right", angleDegrees: 4 }],
      cardOffsets: [{ materialId: "left", offsetY: 0 }, { materialId: "right", offsetY: 0 }],
    },
    durationSeconds: 1.5, width: 180, height: 320, fps: 5, overwrite: true,
  };
  assert.doesNotMatch(buildCollageBackgroundFilter(backgroundSpec), /eq=brightness|saturation=/,
    "a custom background must not receive the previous-frame darkening treatment");
  await renderCollage(backgroundSpec, runner);
  const preparedBackground = join(root, ".collage-background.mkv");
  const backgroundHashes = await runner.run("ffmpeg", [
    "-v", "error", "-i", preparedBackground, "-map", "0:v:0", "-f", "framemd5", "-",
  ]);
  assert.equal(backgroundHashes.exitCode, 0, backgroundHashes.stderr);
  const distinctBackgroundFrames = new Set(backgroundHashes.stdout.split("\n")
    .filter((line) => /^\d/u.test(line)).map((line) => line.split(",").at(-1)?.trim()));
  assert.ok(distinctBackgroundFrames.size > 1, "the custom video background must remain moving");
  const backgroundMetadata = await probeMedia(backgroundOutput, runner) as { streams: { codec_type: string }[] };
  assert.deepEqual(backgroundMetadata.streams.map(({ codec_type }) => codec_type), ["video"]);
});

test("collage renderer produces a decodable silent H.264 file with the configured torn frame", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-collage-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SpawnMediaProcessRunner();
  const red = join(root, "red.png"), blue = join(root, "blue.png"), green = join(root, "green.png");
  const output = join(root, "collage.mp4");
  for (const [path, color] of [[red, "red"], [blue, "blue"], [green, "green"]] as const) {
    const created = await runner.run("ffmpeg", [
      "-y", "-v", "error", "-f", "lavfi", "-i", `color=${color}:s=80x40:d=0.1`,
      "-frames:v", "1", "-update", "1", path,
    ]);
    assert.equal(created.exitCode, 0, created.stderr);
  }
  await renderCollage({
    background: { treatment: "darkened", kind: "image", sourcePath: green, sourceSize: { width: 80, height: 40 } },
    materials: [
      { id: "red", kind: "image", sourcePath: red, sourceSize: { width: 80, height: 40 } },
      { id: "blue", kind: "image", sourcePath: blue, sourceSize: { width: 80, height: 40 } },
    ],
    outputPath: output,
    layoutId: "stack",
    layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4,
    settings: {
      frame: { width: 12, color: "#FFFFFF", shape: "torn" },
      entryDurationSeconds: 0.7,
      rowDirection: "ascending",
      straightCards: false,
      cardAngles: [
        { materialId: "red", angleDegrees: -4 },
        { materialId: "blue", angleDegrees: 4 },
      ],
      cardOffsets: [{ materialId: "red", offsetY: 0 }, { materialId: "blue", offsetY: 0 }],
    },
    durationSeconds: 2,
    width: 180,
    height: 320,
    fps: 5,
  }, runner);
  const metadata = await probeMedia(output, runner) as { streams: { codec_type: string; codec_name: string; pix_fmt: string; width: number; height: number }[] };
  assert.deepEqual(metadata.streams.map(({ codec_type }) => codec_type), ["video"]);
  assert.deepEqual(metadata.streams.map(({ codec_name, pix_fmt, width, height }) => ({ codec_name, pix_fmt, width, height })), [
    { codec_name: "h264", pix_fmt: "yuv420p", width: 180, height: 320 },
  ]);
  const firstPixel = join(root, "first-pixel.rgb");
  const decoded = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", output, "-vf", "select=eq(n\\,0),scale=1:1", "-frames:v", "1",
    "-pix_fmt", "rgb24", "-f", "rawvideo", firstPixel,
  ]);
  assert.equal(decoded.exitCode, 0, decoded.stderr);
  const [firstRed = 0, firstGreen = 0, firstBlue = 0] = await readFile(firstPixel);
  assert.ok(firstGreen > firstRed + 10 && firstGreen > firstBlue + 10,
    `expected the explicit darkened green background, received rgb(${firstRed},${firstGreen},${firstBlue})`);
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

test("master video segments normalize geometry, rational CFR and exact frame count in one encode", async () => {
  let args: readonly string[] = [];
  await renderVideo({
    sourcePath: "landscape.mp4", outputPath: "segment.mp4", sourceSize: { width: 1920, height: 1080 },
    sourceDurationSeconds: 10, hasAudio: true, mode: "video", width: 1080, height: 1920,
    frameRate: { numerator: 24_000, denominator: 1_001 }, durationFrames: 72,
    edit: { rotation: 90, crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 }, trim: { startSeconds: 1, endSeconds: 5 } },
  }, { run: async (executable, received) => {
    assert.equal(executable, "ffmpeg"); args = received; return { exitCode: 0, stdout: "", stderr: "" };
  } });
  const filter = args[args.indexOf("-vf") + 1]!;
  assert.match(filter, /transpose=clock,crop=/);
  assert.match(filter, /scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/);
  assert.match(filter, /fps=24000\/1001,trim=end_frame=72,setpts=PTS-STARTPTS/);
  assert.deepEqual(args.slice(args.indexOf("-frames:v"), args.indexOf("-frames:v") + 2), ["-frames:v", "72"]);
  assert.deepEqual(args.slice(args.indexOf("-threads"), args.indexOf("-threads") + 2), ["-threads", "1"]);
  assert.equal(args.includes("-an"), true);
});

test("story assembly copies normalized video and approved audio without re-encoding", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-assembly-args-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const calls: string[][] = [];
  await assembleStoryMaster({
    segmentPaths: [join(root, "one.mp4"), join(root, "two.mp4")], approvedMixPath: join(root, "mix.m4a"),
    outputPath: join(root, "master.mp4"), frameRate: { numerator: 30, denominator: 1 }, totalFrames: 300,
  }, { run: async (_executable, args) => {
    calls.push([...args]); return { exitCode: 0, stdout: "", stderr: "" };
  } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.slice(calls[0].indexOf("-c:v"), calls[0].indexOf("-c:v") + 2), ["-c:v", "copy"]);
  assert.deepEqual(calls[1]?.slice(calls[1].indexOf("-c:v"), calls[1].indexOf("-c:v") + 4), ["-c:v", "copy", "-c:a", "copy"]);
  assert.doesNotThrow(() => assertSegmentProfile({
    width: 1080, height: 1920, frameRate: "30/1", frameCount: 150,
    videoCodec: "h264", videoProfile: "High", videoLevel: 42, pixelFormat: "yuv420p",
    sampleAspectRatio: "1:1", fieldOrder: "progressive", timeBase: "1/30000",
    colorRange: "tv", colorSpace: "bt709", colorTransfer: "bt709", colorPrimaries: "bt709",
  }, { numerator: 30, denominator: 1 }, 150));
});

test("a copied master fully decodes with the exact segment frame sum and approved audio profile", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-assembly-integration-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SpawnMediaProcessRunner();
  const source = join(root, "source.png");
  const sourceResult = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=16x16", "-frames:v", "1", source,
  ]);
  assert.equal(sourceResult.exitCode, 0, sourceResult.stderr);
  const frameRate = { numerator: 30, denominator: 1 } as const;
  const segments = [join(root, "one.mp4"), join(root, "two.mp4")];
  for (const outputPath of segments) {
    await renderStillImage({
      sourcePath: source, outputPath, sourceSize: { width: 16, height: 16 }, orientation: "landscape",
      durationSeconds: 0.1, durationFrames: 3, frameRate, motion: "none", overwrite: true,
    }, runner);
    assertSegmentProfile(await probeVideoProfile(outputPath, runner), frameRate, 3);
  }
  const mix = join(root, "mix.m4a");
  const mixResult = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.2",
    "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "192k", "-ar", "48000", "-ac", "2", mix,
  ]);
  assert.equal(mixResult.exitCode, 0, mixResult.stderr);
  await assertApprovedStoryMix(mix, 6, frameRate, runner);
  const master = join(root, "master.mp4");
  await assembleStoryMaster({ segmentPaths: segments, approvedMixPath: mix, outputPath: master, frameRate, totalFrames: 6 }, runner);
  const profile = await probeVideoProfile(master, runner);
  assert.equal(profile.frameCount, 6);
  assert.equal(profile.audioCodec, "aac");
  assert.equal(profile.audioSampleRate, 48_000);
  assert.equal(profile.audioChannels, 2);
  const decoded = await runner.run("ffmpeg", ["-v", "error", "-i", master, "-f", "null", "-"]);
  assert.equal(decoded.exitCode, 0, decoded.stderr);
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
