import assert from "node:assert/strict";
import test from "node:test";
import { hashSceneRenderInput, sceneRenderStorageKey, type SceneRenderInput } from "./index.js";

const input: SceneRenderInput = {
  rendererId: "still-image",
  rendererVersion: 1,
  material: {
    storageKey: "uploads/image.jpg", name: "image.jpg", mimeType: "image/jpeg",
    width: 1600, height: 900, orientation: "landscape",
  },
  durationSeconds: 5,
  motion: "pan-left",
  focusPoint: { x: 0.25, y: 0.5 },
  output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
};

test("scene render input hash is deterministic", () => {
  assert.equal(hashSceneRenderInput(input), hashSceneRenderInput({ ...input, material: { ...input.material } }));
  assert.notEqual(hashSceneRenderInput(input), hashSceneRenderInput({ ...input, durationSeconds: 6 }));
});

test("render artifact key is scoped to profile, story, scene and hash", () => {
  assert.equal(sceneRenderStorageKey({ profileId: "p", storyId: "s", sceneId: "c", inputHash: "abc" }),
    "projects/p/s/scenes/c/renders/abc.mp4");
});
