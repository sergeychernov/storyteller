import assert from "node:assert/strict";
import test from "node:test";
import type { Scene } from "../../api.js";
import { moveMaterialBetweenScenes } from "./material-scene-move-model.js";

const material = (id: string) => ({
  id, kind: "image" as const, name: `${id}.png`, orientation: "portrait" as const, storageKey: `${id}.png`,
  mimeType: "image/png", sizeBytes: 1, width: 9, height: 16,
});
const scene = (id: string, materialIds: readonly string[]): Scene => ({
  id, materials: materialIds.map(material), durationSeconds: 5, motion: "none", render: { status: "idle" },
});

test("optimistically moves one material to the requested target position", () => {
  const scenes = [scene("source", ["a", "b"]), scene("target", ["c"]), scene("other", ["d"])];
  const changed = moveMaterialBetweenScenes(scenes, "source", "a", "target", 1);
  assert.deepEqual(changed.map(({ materials }) => materials.map(({ id }) => id)), [["b"], ["c", "a"], ["d"]]);
  assert.deepEqual(scenes.map(({ materials }) => materials.map(({ id }) => id)), [["a", "b"], ["c"], ["d"]]);
  assert.equal(changed[2], scenes[2]);
});

test("does not approximate an invalid cross-scene move", () => {
  const scenes = [scene("source", ["a"]), scene("target", [])];
  assert.equal(moveMaterialBetweenScenes(scenes, "source", "missing", "target", 0), scenes);
  assert.equal(moveMaterialBetweenScenes(scenes, "source", "a", "source", 0), scenes);
  assert.equal(moveMaterialBetweenScenes(scenes, "source", "a", "target", 1), scenes);
});
