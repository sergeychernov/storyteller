import assert from "node:assert/strict";
import test from "node:test";
import { buildSingleImageMotionFrames, getCoverGeometry } from "./single-image-motion.js";

test("landscape motion fills 9:16 and crosses its entire horizontal overflow", () => {
  const geometry = getCoverGeometry(1920, 1080);
  assert.deepEqual(geometry, { width: 256 / 81, height: 1 });
  const frames = buildSingleImageMotionFrames(geometry, "pan-right", { x: 0.5, y: 0.5 }, 10);
  assert.match(frames[0]?.transform ?? "", /translate\(-?0\.0000%/);
  assert.match(frames.at(-1)?.transform ?? "", /translate\(-68\.3594%/);
  const before = parseTranslateX(frames[4]?.transform ?? "");
  const after = parseTranslateX(frames[6]?.transform ?? "");
  assert.ok(Math.abs(after - before) < 10);
});

test("portrait zoom starts at minimum cover and keeps the focus in its crop", () => {
  const geometry = getCoverGeometry(1080, 1920);
  const frames = buildSingleImageMotionFrames(geometry, "zoom-in", { x: 0.25, y: 0.75 }, 2);
  assert.equal(frames[0]?.transform, "translate(0.0000%, 0.0000%) scale(1.00000)");
  assert.match(frames.at(-1)?.transform ?? "", /scale\(1\.13000\)/);
  assert.match(frames.at(-1)?.transform ?? "", /translate\(0\.0000%, -13\.0000%\)/);
});

function parseTranslateX(transform: string): number {
  return Number(/translate\((-?[\d.]+)%/.exec(transform)?.[1]);
}
