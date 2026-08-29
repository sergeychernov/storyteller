import assert from "node:assert/strict";
import test from "node:test";
import type { Scene } from "../../api.js";
import { sceneFrameCacheKey, supportsSceneFrame } from "./scene-frame-model.js";

const scene: Scene = {
  id: "scene", title: "Visible label", durationSeconds: 5, motion: "pan-left", rendererId: "still-image",
  materials: [{ id: "material", kind: "image", name: "photo.png", storageKey: "photo.png", contentHash: "a".repeat(64),
    mimeType: "image/png", sizeBytes: 10, width: 100, height: 200, orientation: "portrait" }],
  render: { status: "idle" },
};

test("scene frame UI cache follows visual inputs but excludes titles and render state", () => {
  assert.equal(supportsSceneFrame(scene), true);
  const key = sceneFrameCacheKey(scene);
  assert.equal(key, sceneFrameCacheKey({ ...scene, title: "Renamed", render: { status: "ready", artifactId: "old" } }));
  assert.notEqual(key, sceneFrameCacheKey({ ...scene, durationSeconds: 6 }));
  assert.notEqual(key, sceneFrameCacheKey({ ...scene, materials: [{ ...scene.materials[0]!, contentHash: "b".repeat(64) }] }));
  assert.equal(supportsSceneFrame({ ...scene, materials: [] }), false);
});
