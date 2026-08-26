import assert from "node:assert/strict";
import test from "node:test";
import { createStillImageMotionPlan } from "@storyteller/domain";
import { buildStillImageFilter, probeMedia, renderStillImage, type MediaProcessRunner } from "./index.js";

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
  const filter = calls[0]?.args[calls[0].args.indexOf("-filter_complex") + 1] ?? "";
  assert.match(filter, /scale=2160:3840/);
  assert.match(filter, /zoompan=z='1\.130-0\.130/);
  assert.match(filter, /iw\*0\.250/);
  assert.match(filter, /ih\*0\.700/);
  assert.equal(calls[0]?.args.at(-1), "portrait.mp4");
});
