import assert from "node:assert/strict";
import test from "node:test";
import type { ImageMaterial, Scene } from "../../api.js";
import { isSingleImageScene, resolveEditorRenderer } from "./scene-renderer-model.js";

const image: ImageMaterial = {
  id: "image", kind: "image", name: "image.jpg", orientation: "landscape", storageKey: "image.jpg",
  mimeType: "image/jpeg", sizeBytes: 100, width: 1920, height: 1080,
};

test("still-image renderer owns only a scene with exactly one image", () => {
  assert.equal(isSingleImageScene(scene({ materials: [image] })), true);
  assert.equal(resolveEditorRenderer(scene({ rendererId: "still-image", materials: [image] })), "still-image");
  assert.equal(resolveEditorRenderer(scene({ materials: [image] })), "still-image");
  assert.equal(resolveEditorRenderer(scene({ rendererId: "ai-animation", materials: [image] })), "layout");
  assert.equal(resolveEditorRenderer(scene({ rendererId: "still-image", materials: [image, { ...image, id: "second" }] })), "layout");
  assert.equal(isSingleImageScene(scene({ materials: [{ ...image, kind: "video", hasAudio: false, audioTags: [] }] })), false);
});

function scene(change: Partial<Scene>): Scene {
  return {
    id: "scene", materials: [], durationSeconds: 5, motion: "none",
    render: { status: "idle" }, ...change,
  };
}
