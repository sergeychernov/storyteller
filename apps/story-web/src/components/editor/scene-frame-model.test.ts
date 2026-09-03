import assert from "node:assert/strict";
import test from "node:test";
import { createCollageCardAngles, createCollageCardOffsets, defaultCollageSettings } from "@storyteller/domain";
import type { Scene } from "../../api.js";
import { sceneFrameCacheKey, supportsSceneFrame } from "./scene-frame-model.js";

const title = (text: string) => ({
  text, position: { x: 0.5, y: 0.78 }, style: "shadow" as const, size: "medium" as const, color: "#FFFFFF" as const,
  timing: { startSeconds: 0, endSeconds: 5 },
});

const scene: Scene = {
  id: "scene", title: title("Visible label"), durationSeconds: 5, motion: "pan-left", rendererId: "still-image",
  materials: [{ id: "material", kind: "image", name: "photo.png", storageKey: "photo.png", contentHash: "a".repeat(64),
    mimeType: "image/png", sizeBytes: 10, width: 100, height: 200, orientation: "portrait" }],
  render: { status: "idle" },
};

test("scene frame UI cache follows visual inputs but excludes titles and render state", () => {
  assert.equal(supportsSceneFrame(scene), true);
  const key = sceneFrameCacheKey(scene);
  assert.equal(key, sceneFrameCacheKey({ ...scene, title: title("Renamed"), render: { status: "ready", artifactId: "old" } }));
  assert.notEqual(key, sceneFrameCacheKey({ ...scene, durationSeconds: 6 }));
  assert.notEqual(key, sceneFrameCacheKey({ ...scene, materials: [{ ...scene.materials[0]!, contentHash: "b".repeat(64) }] }));
  assert.equal(supportsSceneFrame({ ...scene, materials: [] }), false);
});

test("collage frames are supported and every visual setting invalidates their UI cache", () => {
  const first = { ...scene.materials[0]!, width: 200, height: 100, orientation: "landscape" as const };
  const materials = [first, { ...first, id: "second", contentHash: "b".repeat(64) }];
  const collage: Scene = {
    ...scene, rendererId: "collage", layoutId: "stack", motion: "none", materials,
    collage: {
      ...defaultCollageSettings(materials),
      cardAngles: createCollageCardAngles({
        layoutId: "stack", materials, straightCards: false, seedKey: "frame-cache",
      }),
      cardOffsets: createCollageCardOffsets({
        layoutId: "stack", materials, direction: "ascending", seedKey: "frame-cache",
      }),
    },
  };
  assert.equal(supportsSceneFrame(collage), true);
  assert.notEqual(sceneFrameCacheKey(collage), sceneFrameCacheKey({
    ...collage,
    collage: { ...collage.collage!, frame: { ...collage.collage!.frame, color: "#112233" } },
  }));
  assert.notEqual(sceneFrameCacheKey(collage), sceneFrameCacheKey({
    ...collage,
    collage: {
      ...collage.collage!,
      cardOffsets: collage.collage!.cardOffsets.map((offset, index) => index ? offset : { ...offset, offsetY: -2 }),
    },
  }));
  assert.notEqual(sceneFrameCacheKey(collage), sceneFrameCacheKey({
    ...collage,
    collage: {
      ...collage.collage!,
      cardAngles: collage.collage!.cardAngles.map((angle, index) => index ? angle : { ...angle, angleDegrees: -2 }),
    },
  }));
  assert.notEqual(sceneFrameCacheKey(collage), sceneFrameCacheKey({
    ...collage,
    collage: {
      ...collage.collage!, straightCards: true,
      cardAngles: collage.collage!.cardAngles.map(({ materialId }) => ({ materialId, angleDegrees: 0 })),
    },
  }));
  assert.notEqual(sceneFrameCacheKey(collage), sceneFrameCacheKey({
    ...collage,
    collageBackground: { source: "material", material: {
      ...first, id: "background", storageKey: "background.png", contentHash: "c".repeat(64),
    } },
  }));
});
