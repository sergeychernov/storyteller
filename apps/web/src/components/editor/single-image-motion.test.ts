import assert from "node:assert/strict";
import test from "node:test";
import { createStillImageMotionPlan, getAxisFocusProgress, verticalStoryFrame } from "@storyteller/domain";
import type { FocusPoint, SceneMotion } from "@storyteller/domain";
import { buildSingleImageMotionFrames } from "./single-image-motion.js";

test("landscape motion fills 9:16 and crosses its entire horizontal overflow", () => {
  const plan = createPlan(1920, 1080, "pan-right", { x: 0.5, y: 0.5 });
  const geometry = plan.geometry;
  assert.deepEqual(geometry, { width: 256 / 81, height: 1 });
  const frames = buildSingleImageMotionFrames(plan, 10);
  assert.match(frames[0]?.transform ?? "", /translate\(-?0\.0000%/);
  assert.match(frames.at(-1)?.transform ?? "", /translate\(-68\.3594%/);
  const before = parseTranslateX(frames[4]?.transform ?? "");
  const after = parseTranslateX(frames[6]?.transform ?? "");
  assert.ok(Math.abs(after - before) < 10);
});

test("landscape motion slows when the source focus is centered in either direction", () => {
  const geometry = createPlan(1920, 1080, "pan-right", { x: 0.5, y: 0.5 }).geometry;
  const expectedCameraProgress = 0.25;
  const focusX = (expectedCameraProgress * (geometry.width - 1) + 0.5) / geometry.width;
  assert.ok(Math.abs(getAxisFocusProgress(geometry.width, focusX) - expectedCameraProgress) < 1e-9);

  const rightFrames = buildSingleImageMotionFrames(createPlan(1920, 1080, "pan-right", { x: focusX, y: 0.5 }), 100);
  const leftFrames = buildSingleImageMotionFrames(createPlan(1920, 1080, "pan-left", { x: focusX, y: 0.5 }), 100);

  assert.ok(Math.abs(sourceXAtFrameCenter(geometry.width, rightFrames[25]?.transform ?? "") - focusX) < 1e-4);
  assert.ok(Math.abs(sourceXAtFrameCenter(geometry.width, leftFrames[75]?.transform ?? "") - focusX) < 1e-4);
  assert.ok(Math.abs(indexOfSlowestStep(rightFrames) - 25) <= 1);
  assert.ok(Math.abs(indexOfSlowestStep(leftFrames) - 75) <= 1);
});

test("portrait zoom starts at minimum cover and keeps the focus in its crop", () => {
  const frames = buildSingleImageMotionFrames(createPlan(1080, 1920, "zoom-in", { x: 0.25, y: 0.75 }), 2);
  assert.equal(frames[0]?.transform, "translate(0.0000%, 0.0000%) scale(1.00000)");
  assert.match(frames.at(-1)?.transform ?? "", /scale\(1\.13000\)/);
  assert.match(frames.at(-1)?.transform ?? "", /translate\(0\.0000%, -13\.0000%\)/);
});

function parseTranslateX(transform: string): number {
  return Number(/translate\((-?[\d.]+)%/.exec(transform)?.[1]);
}

function sourceXAtFrameCenter(geometryWidth: number, transform: string): number {
  return 0.5 / geometryWidth - parseTranslateX(transform) / 100;
}

function indexOfSlowestStep(frames: readonly { readonly transform: string }[]): number {
  let slowestIndex = 1;
  let slowestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < frames.length - 1; index += 1) {
    const before = parseTranslateX(frames[index - 1]?.transform ?? "");
    const after = parseTranslateX(frames[index + 1]?.transform ?? "");
    const distance = Math.abs(after - before);
    if (distance < slowestDistance) {
      slowestDistance = distance;
      slowestIndex = index;
    }
  }
  return slowestIndex;
}

function createPlan(sourceWidth: number, sourceHeight: number, motion: SceneMotion, focusPoint: FocusPoint) {
  return createStillImageMotionPlan({
    sourceSize: { width: sourceWidth, height: sourceHeight },
    frameSize: verticalStoryFrame,
    orientation: sourceWidth > sourceHeight ? "landscape" : "portrait",
    motion,
    focusPoint,
  });
}
