import assert from "node:assert/strict";
import test from "node:test";
import { cropForAspect, cropPixelSize, identityEdit, resizeCrop, rotateEdit, sameEdit, updateTrimBoundary, withVideoTrim } from "./material-editor-model.js";

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

test("video trim survives spatial edits and contributes to unsaved changes", () => {
  const edit = { ...identityEdit, trim: { startSeconds: 1.25, endSeconds: 4.5 } };
  assert.deepEqual(rotateEdit(edit, true).trim, edit.trim);
  assert.deepEqual(rotateEdit(rotateEdit(edit, true), false), edit);
  assert.equal(sameEdit(edit, identityEdit), false);
  assert.equal(sameEdit(edit, { ...edit, trim: { ...edit.trim } }), true);
  assert.equal(sameEdit(edit, { ...edit, trim: { ...edit.trim, endSeconds: 5 } }), false);
  assert.equal(sameEdit(edit, { ...edit, trim: { ...edit.trim, startSeconds: 1 } }), false);
  assert.deepEqual(withVideoTrim(edit, { startSeconds: 0, endSeconds: 6 }, 6), identityEdit);
  assert.deepEqual(withVideoTrim(identityEdit, edit.trim, 6), edit);
});

test("trim handles stay within the original duration and cannot cross", () => {
  const range = { startSeconds: 1, endSeconds: 4 };
  assert.equal(updateTrimBoundary(range, "startSeconds", -1, 5).startSeconds, 0);
  assert.equal(updateTrimBoundary(range, "startSeconds", 6, 5).startSeconds, 3.9);
  assert.equal(updateTrimBoundary(range, "endSeconds", 0, 5).endSeconds, 1.1);
  assert.equal(updateTrimBoundary(range, "endSeconds", 9, 5).endSeconds, 5);
  assert.deepEqual(updateTrimBoundary(range, "endSeconds", Number.NaN, 5), range);
  const short = { startSeconds: 0, endSeconds: 0.05 };
  assert.deepEqual(updateTrimBoundary(short, "startSeconds", 1, 5), short);
  assert.deepEqual(updateTrimBoundary(short, "endSeconds", 0, 0.05), short);
});

test("video crop dimensions include the even-pixel alignment used by the encoder", () => {
  assert.equal(cropPixelSize(640, 0.21875, 0.5625, true), 360);
  assert.equal(cropPixelSize(640, 0.2, 0.317, true), 204);
  assert.equal(cropPixelSize(641, 0, 1, true), 640);
  assert.equal(cropPixelSize(641, 0, 1), 641);
  assert.equal(cropPixelSize(640, 0.999, 0.001, true), 2);
});
