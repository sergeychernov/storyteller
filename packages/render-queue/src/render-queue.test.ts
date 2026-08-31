import assert from "node:assert/strict";
import test from "node:test";
import { hashSceneRenderInput, sceneFrameDependency, sceneRenderFileType, sceneRenderSlot, sceneRenderStorageKey, type SceneRenderInput } from "./index.js";

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

test("collage fingerprint follows layout, crop-aware size, frame settings and ordered source contents", () => {
  const collage: SceneRenderInput = {
    rendererId: "collage", rendererVersion: 23, layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: 0.4, durationSeconds: 5,
    settings: {
      frame: { width: 12, color: "#FFFFFF", shape: "torn" },
      entryDurationSeconds: 4,
      rowDirection: "ascending",
      straightCards: false,
      cardAngles: [
        { materialId: "a", angleDegrees: -4 },
        { materialId: "b", angleDegrees: 4 },
      ],
      cardOffsets: [{ materialId: "a", offsetY: 0 }, { materialId: "b", offsetY: 0 }],
    },
    materials: [
      { id: "a", kind: "image", storageKey: "a.jpg", name: "a.jpg", mimeType: "image/jpeg", width: 800, height: 600,
        orientation: "landscape", contentHash: "a".repeat(64) },
      { id: "b", kind: "image", storageKey: "b.jpg", name: "b.jpg", mimeType: "image/jpeg", width: 800, height: 600,
        orientation: "landscape", contentHash: "b".repeat(64) },
    ],
    dependencies: [
      { role: "original", storageKey: "a.jpg", contentHash: "a".repeat(64), parents: [], parameters: { materialId: "a", index: 0 } },
      { role: "original", storageKey: "b.jpg", contentHash: "b".repeat(64), parents: [], parameters: { materialId: "b", index: 1 } },
    ],
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
  };
  if (collage.rendererId !== "collage") throw new Error("expected collage input");
  const hash = hashSceneRenderInput(collage);
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, layoutId: "2x2" }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, layoutRendererId: "animated-collage.stack.v2" }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, layoutOverlapRatio: 0.42 }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, settings: { ...collage.settings, frame: { ...collage.settings.frame, color: "#000000" } } }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, settings: { ...collage.settings, rowDirection: "descending" } }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, settings: {
    ...collage.settings,
    cardAngles: collage.settings.cardAngles.map((angle, index) => index ? angle : { ...angle, angleDegrees: -5 }),
  } }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, settings: {
    ...collage.settings,
    cardOffsets: collage.settings.cardOffsets.map((offset, index) => index ? offset : { ...offset, offsetY: -5 }),
  } }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, materials: collage.materials.map((material, index) => index
    ? material : { ...material, width: 700 }) }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, background: {
    source: "previous-scene-frame", treatment: "darkened", sceneId: "previous", inputHash: "c".repeat(64), contentHash: "d".repeat(64),
    storageKey: "previous.png", name: "previous.png", mimeType: "image/png",
    width: 1080, height: 1920, orientation: "portrait",
  } }));
  assert.notEqual(hash, hashSceneRenderInput({ ...collage, dependencies: [...collage.dependencies!].reverse() }));
});

test("render artifact key is scoped to profile, story, scene and hash", () => {
  assert.equal(sceneRenderStorageKey({ profileId: "p", storyId: "s", sceneId: "c", inputHash: "abc" }),
    "projects/p/s/scenes/c/renders/abc.mp4");
});

test("retention slots separate downloadable formats and intermediate scene frames", () => {
  assert.equal(sceneRenderSlot(input), "scene-render:video");
  const video = { ...input, rendererId: "video", mode: "combined", hasAudio: true,
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } } } satisfies SceneRenderInput;
  assert.equal(sceneRenderSlot(video), "scene-render:combined");
  assert.equal(sceneRenderSlot({ ...video, mode: "audio" }), "scene-render:audio");
  assert.equal(sceneRenderSlot({ ...input, artifact: "scene-frame", frame: {
    rendererVersion: 1, format: "png", compressionLevel: 6, intermediateCodec: "h264-lossless", layerPolicy: "base-visual",
  } }), "scene-frame");
});

test("scene frame has its own cache fingerprint, S3 collection and dependency snapshot", () => {
  const frame: SceneRenderInput = { ...input, artifact: "scene-frame", frame: {
    rendererVersion: 1, format: "png", compressionLevel: 6, intermediateCodec: "h264-lossless", layerPolicy: "base-visual",
  } };
  assert.notEqual(hashSceneRenderInput(frame), hashSceneRenderInput(input));
  assert.equal(sceneRenderStorageKey({ profileId: "p", storyId: "s", sceneId: "c", inputHash: "abc", input: frame }),
    "projects/p/s/scenes/c/frames/abc.png");
  assert.deepEqual(sceneRenderFileType(frame), { extension: "png", mimeType: "image/png" });
  const dependency = sceneFrameDependency({ sceneId: "scene-a", inputHash: "a".repeat(64), storageKey: "frame-a.png", contentHash: "b".repeat(64) });
  const dependent: SceneRenderInput = { ...input, dependencies: [dependency] };
  assert.notEqual(hashSceneRenderInput(dependent), hashSceneRenderInput({ ...dependent, dependencies: [{
    ...dependency, contentHash: "c".repeat(64), parameters: { sceneId: "scene-a", inputHash: "d".repeat(64) },
  }] }));
  assert.throws(() => sceneFrameDependency({ sceneId: "scene-a", inputHash: "a".repeat(64) }), /storage and content hash/);
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
