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

test("video render cache distinguishes tracks, trim, crop and export mode", () => {
  const video: SceneRenderInput = { ...input, rendererId: "video", mode: "combined", hasAudio: true,
    audio: { storageKey: "audio.m4a", name: "audio.m4a", mimeType: "audio/mp4" },
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 1, endSeconds: 4 } },
  };
  for (const changed of [
    { ...video, mode: "audio" as const }, { ...video, mode: "video" as const },
    { ...video, audio: { ...video.audio!, storageKey: "reprocessed.m4a" } },
    { ...video, edit: { ...video.edit, trim: { startSeconds: 2, endSeconds: 4 } } },
    { ...video, edit: { ...video.edit, rotation: 90 as const } },
  ]) assert.notEqual(hashSceneRenderInput(video), hashSceneRenderInput(changed));
  assert.equal(sceneRenderStorageKey({ profileId: "p", storyId: "s", sceneId: "c", inputHash: "audio", input: { ...video, mode: "audio" } }),
    "projects/p/s/scenes/c/renders/audio.m4a");
});
