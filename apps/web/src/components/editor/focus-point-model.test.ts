import assert from "node:assert/strict";
import test from "node:test";
import { focusPointFromClient } from "./focus-point-model.js";

test("maps a pointer inside the rendered image to normalized focus coordinates", () => {
  const bounds = { left: 100, top: 50, width: 400, height: 800 };
  assert.deepEqual(focusPointFromClient(bounds, 300, 250), { x: 0.5, y: 0.25 });
  assert.deepEqual(focusPointFromClient(bounds, 0, 1_000), { x: 0, y: 1 });
});

test("keeps the focus on the same source pixel when the rendered image is scaled", () => {
  const focus = { x: 0.38, y: 0.48 };
  const initial = { left: 100, top: 50, width: 400, height: 800 };
  const scaled = { left: 42, top: -66, width: 516, height: 1032 };
  assert.deepEqual(
    focusPointFromClient(initial, initial.left + initial.width * focus.x, initial.top + initial.height * focus.y),
    focus,
  );
  assert.deepEqual(
    focusPointFromClient(scaled, scaled.left + scaled.width * focus.x, scaled.top + scaled.height * focus.y),
    focus,
  );
});
