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

test("versioned fingerprints follow content, processing and transitive parents instead of file locations", () => {
  const versioned: SceneRenderInput = { ...input, dependencies: [
    { role: "original", storageKey: "original.jpg", contentHash: "a".repeat(64), parents: [], parameters: {} },
    { role: "image-edit", storageKey: "edited.jpg", contentHash: "b".repeat(64), parents: ["original"], parameters: { rotation: 90 } },
  ] };
  const hash = hashSceneRenderInput(versioned);
  assert.equal(hash, hashSceneRenderInput({ ...versioned, material: { ...input.material, name: "renamed.jpg", storageKey: "new-key" },
    dependencies: versioned.dependencies!.map((dependency) => ({ ...dependency, storageKey: `new/${dependency.storageKey}` })).reverse() }));
  for (const changed of [
    { ...versioned, rendererVersion: 2 },
    { ...versioned, dependencies: versioned.dependencies!.map((dependency) => dependency.role === "original"
      ? { ...dependency, contentHash: "c".repeat(64) } : dependency) },
    { ...versioned, dependencies: versioned.dependencies!.map((dependency) => dependency.role === "image-edit"
      ? { ...dependency, parameters: { rotation: 180 } } : dependency) },
  ]) assert.notEqual(hash, hashSceneRenderInput(changed));
  assert.notEqual(hash, hashSceneRenderInput(input));
});

test("an audio version ignores visual parameters but still depends on its trim and source", () => {
  const audio: SceneRenderInput = { ...input, rendererId: "video", mode: "audio", hasAudio: true,
    sourceDurationSeconds: 10, edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
    dependencies: [{ role: "original", storageKey: "video.mp4", contentHash: "a".repeat(64), parents: [], parameters: {} }],
  };
  const hash = hashSceneRenderInput(audio);
  assert.equal(hash, hashSceneRenderInput({ ...audio, motion: "none", focusPoint: { x: 1, y: 0 }, durationSeconds: 15,
    edit: { rotation: 90, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } } }));
  assert.notEqual(hash, hashSceneRenderInput({ ...audio, edit: { ...audio.edit, trim: { startSeconds: 2, endSeconds: 5 } } }));
});
