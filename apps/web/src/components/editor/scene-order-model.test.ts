import assert from "node:assert/strict";
import test from "node:test";
import { hasSceneOrderChanged, mergeSceneOrder, moveScene } from "./scene-order-model.js";

test("moves a scene to the hovered timeline position without mutating the source", () => {
  const source = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(moveScene(source, 0, 2).map(({ id }) => id), ["b", "c", "a"]);
  assert.deepEqual(source.map(({ id }) => id), ["a", "b", "c"]);
});

test("ignores an invalid or unchanged timeline move", () => {
  const source = [{ id: "a" }, { id: "b" }];
  assert.equal(moveScene(source, 0, 0), source);
  assert.equal(moveScene(source, -1, 1), source);
  assert.equal(moveScene(source, 0, 2), source);
});

test("merges fresh scene data into the local drag order", () => {
  const local = [{ id: "b", title: "old b" }, { id: "a", title: "old a" }, { id: "deleted", title: "old" }];
  const authoritative = [{ id: "a", title: "new a" }, { id: "b", title: "new b" }, { id: "added", title: "new" }];
  assert.deepEqual(mergeSceneOrder(local, authoritative), [
    { id: "b", title: "new b" }, { id: "a", title: "new a" }, { id: "added", title: "new" },
  ]);
});

test("detects only meaningful scene order changes", () => {
  const reference = [{ id: "a" }, { id: "b" }];
  assert.equal(hasSceneOrderChanged([{ id: "a" }, { id: "b" }], reference), false);
  assert.equal(hasSceneOrderChanged([{ id: "b" }, { id: "a" }], reference), true);
  assert.equal(hasSceneOrderChanged([{ id: "a" }], reference), true);
});
