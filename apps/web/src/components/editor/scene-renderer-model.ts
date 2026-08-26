import type { Scene } from "../../api.js";

export type EditorRendererKind = "still-image" | "layout";

export function isSingleImageScene(scene: Scene): boolean {
  return scene.materials.length === 1 && scene.materials[0]?.kind === "image";
}

export function resolveEditorRenderer(scene: Scene): EditorRendererKind {
  return (scene.rendererId === undefined || scene.rendererId === "still-image") && isSingleImageScene(scene)
    ? "still-image"
    : "layout";
}
