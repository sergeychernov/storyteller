import assert from "node:assert/strict";
import test from "node:test";
import type { ImageMaterial, Scene } from "../../api.js";
import { defaultCollageSettings } from "@storyteller/domain";
import { isRenderableCollageScene, isSingleImageScene, isSingleVideoScene, resolveEditorRenderer } from "./scene-renderer-model.js";

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
  assert.equal(isSingleImageScene(scene({ materials: [{ ...image, kind: "video", hasAudio: false, audioTags: [], sourceDurationSeconds: 10 }] })), false);
});

test("only a single video omits scene composition controls", () => {
  const video = { ...image, kind: "video" as const, hasAudio: false, audioTags: [], sourceDurationSeconds: 10 };
  assert.equal(isSingleVideoScene(scene({ materials: [video] })), true);
  assert.equal(isSingleVideoScene(scene({ materials: [image] })), false);
  assert.equal(isSingleVideoScene(scene({ materials: [video, image] })), false);
  assert.equal(isSingleVideoScene(scene({ materials: [video, { ...video, id: "second" }] })), false);
  assert.equal(isSingleVideoScene(scene({ materials: [] })), false);
});

test("collage preview and export require an exact or explicitly selected reference layout", () => {
  const landscapes = [image, { ...image, id: "second" }];
  assert.equal(isRenderableCollageScene(scene({
    rendererId: "collage", materials: landscapes, collage: defaultCollageSettings(landscapes),
  })), true);
  const portraits = Array.from({ length: 6 }, (_, index) => ({
    ...image, id: `portrait-${index}`, width: 900, height: 1600, orientation: "portrait" as const,
  }));
  assert.equal(isRenderableCollageScene(scene({
    rendererId: "collage", materials: portraits, collage: defaultCollageSettings(portraits),
  })), false);
  assert.equal(isRenderableCollageScene(scene({
    rendererId: "collage", layoutId: "portrait-pairs-ascending", materials: portraits,
    collage: defaultCollageSettings(portraits),
  })), true);
});

function scene(change: Partial<Scene>): Scene {
  return {
    id: "scene", materials: [], durationSeconds: 5, motion: "none",
    render: { status: "idle" }, ...change,
  };
}
