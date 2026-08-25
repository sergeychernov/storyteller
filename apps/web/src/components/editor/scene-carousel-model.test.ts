import assert from "node:assert/strict";
import test from "node:test";
import { buildSceneCarouselSlots, sceneCarouselKey } from "./scene-carousel-model.js";

test("an empty story has one actionable carousel slot", () => {
  assert.deepEqual(buildSceneCarouselSlots([]), [{ key: "edge:empty", kind: "edge", edge: "empty" }]);
});

test("scene slots are framed by actionable story edges", () => {
  const first = { id: "first" };
  const second = { id: "second" };
  const slots = buildSceneCarouselSlots([first, second]);

  assert.deepEqual(slots, [
    { key: "edge:before", kind: "edge", edge: "before" },
    { key: sceneCarouselKey(first.id), kind: "scene", scene: first, index: 0 },
    { key: sceneCarouselKey(second.id), kind: "scene", scene: second, index: 1 },
    { key: "edge:after", kind: "edge", edge: "after" },
  ]);
});
