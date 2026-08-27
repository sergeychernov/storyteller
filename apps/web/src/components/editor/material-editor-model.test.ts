import assert from "node:assert/strict";
import test from "node:test";
import { cropForAspect, resizeCrop, rotateEdit } from "./material-editor-model.js";

test("rotating an edit keeps the selected source region", () => {
  const edit = { rotation: 0 as const, crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
  const clockwise = rotateEdit(edit, true);
  assert.deepEqual(clockwise, {
    rotation: 90,
    crop: { x: 0.4, y: 0.1, width: 0.4, height: 0.3 },
  });
  assert.deepEqual(rotateEdit(clockwise, false), edit);
});

test("crop presets use pixel aspect ratio and stay centered", () => {
  assert.deepEqual(cropForAspect({ width: 1920, height: 1080 }, 1), {
    x: 0.21875, y: 0, width: 0.5625, height: 1,
  });
  assert.deepEqual(cropForAspect({ width: 1080, height: 1920 }, 9 / 16), {
    x: 0, y: 0, width: 1, height: 1,
  });
});

test("moving and resizing a crop cannot leave the source bounds", () => {
  const crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  assert.deepEqual(resizeCrop(crop, "move", 1, -1), { ...crop, x: 0.5, y: 0 });
  assert.deepEqual(resizeCrop(crop, "south-east", 1, 1), { x: 0.2, y: 0.2, width: 0.8, height: 0.8 });
});
