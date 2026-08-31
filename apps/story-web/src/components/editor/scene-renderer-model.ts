import type { Scene } from "../../api.js";
import {
  collageCardMaterials, getSelectedCollageLayout, resolveCollageSettings,
} from "@storyteller/domain";

export type EditorRendererKind = "still-image" | "layout";

export function isSingleImageScene(scene: Scene): boolean {
  return scene.materials.length === 1 && scene.materials[0]?.kind === "image";
}

export function isSingleVideoScene(scene: Scene): boolean {
  return scene.materials.length === 1 && scene.materials[0]?.kind === "video";
}

export function isRenderableCollageScene(scene: Scene): boolean {
  if (scene.rendererId !== "collage") return false;
  const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
  return getSelectedCollageLayout(collageCardMaterials(scene.materials, settings), scene.layoutId) !== undefined;
}

export function resolveEditorRenderer(scene: Scene): EditorRendererKind {
  return (scene.rendererId === undefined || scene.rendererId === "still-image") && isSingleImageScene(scene)
    ? "still-image"
    : "layout";
}
