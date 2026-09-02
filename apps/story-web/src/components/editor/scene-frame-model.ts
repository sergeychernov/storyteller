import type { Scene } from "../../api.js";
import { isRenderableCollageScene } from "./scene-renderer-model.js";

export function supportsSceneFrame(scene: Scene): boolean {
  const material = scene.materials[0];
  return scene.materials.length === 1 && Boolean(material)
    && (material?.kind === "video" || material?.kind === "image" && scene.rendererId === "still-image")
    || isRenderableCollageScene(scene);
}

/** UI cache identity mirrors base visual inputs and deliberately excludes labels and render status. */
export function sceneFrameCacheKey(scene: Scene): string {
  return sceneVisualIdentity(scene);
}

/** Stable identity for every field that can change the rendered scene. */
export function sceneVisualIdentity(scene: Scene): string {
  return JSON.stringify({
    id: scene.id,
    rendererId: scene.rendererId,
    layoutId: scene.layoutId,
    durationSeconds: scene.durationSeconds,
    motion: scene.motion,
    focusPoint: scene.focusPoint,
    collage: scene.collage,
    collageBackground: scene.collageBackground?.source === "material" ? {
      source: scene.collageBackground.source,
      material: visualMaterial(scene.collageBackground.material),
    } : scene.collageBackground,
    materials: scene.materials.map(visualMaterial),
  });
}

function visualMaterial(material: Scene["materials"][number]) {
  return {
    id: material.id,
    kind: material.kind,
    contentHash: material.contentHash,
    storageKey: material.storageKey,
    width: material.width,
    height: material.height,
    edit: material.edit,
    ...(material.kind === "video" ? {
      sourceDurationSeconds: material.sourceDurationSeconds,
      videoTrack: material.videoTrack,
    } : {}),
  };
}
