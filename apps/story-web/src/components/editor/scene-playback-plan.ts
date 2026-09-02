import { collageCardMaterials, resolveCollageSettings } from "@storyteller/domain";
import type { Scene, SceneMaterial } from "../../api.js";
import { sceneVisualIdentity } from "./scene-frame-model.js";
import { resolveEditorRenderer } from "./scene-renderer-model.js";

export type ScenePlaybackSlotRole = "still-image" | "layout" | "collage-card" | "collage-background";
export type ScenePlaybackEndBehavior = "hold" | "loop";

export interface ScenePlaybackSlot {
  readonly id: string;
  readonly material: SceneMaterial;
  readonly index: number;
  readonly role: ScenePlaybackSlotRole;
  readonly audioEnabled: boolean;
  readonly endBehavior: ScenePlaybackEndBehavior;
}

export type ScenePlaybackBackground = {
  readonly kind: "material";
  readonly mode: "custom-material" | "card-fallback";
  readonly treated: boolean;
  readonly slot: ScenePlaybackSlot;
} | {
  readonly kind: "previous-scene-frame";
  readonly mode: "previous-scene";
  readonly treated: true;
  readonly scene: Scene;
  readonly fallback?: ScenePlaybackSlot | undefined;
};

export interface ScenePlaybackPlan {
  readonly identity: string;
  readonly scene: Scene;
  readonly slots: readonly ScenePlaybackSlot[];
  readonly background?: ScenePlaybackBackground | undefined;
  readonly requiredResourceIds: readonly string[];
}

/**
 * The authoritative playback interpretation of a scene. Geometry consumes this
 * plan, while editor and story-preview provide only their clock and controls.
 */
export function buildScenePlaybackPlan(scene: Scene, previousScene?: Scene | undefined): ScenePlaybackPlan {
  const renderer = resolveEditorRenderer(scene);
  const slots = renderer === "still-image"
    ? scene.materials[0]?.kind === "image" ? [slot(scene.materials[0], 0, "still-image", false, "hold")] : []
    : scene.rendererId === "collage"
      ? collageCardMaterials(scene.materials, resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds))
        .map((material, index) => slot(material, index, "collage-card", false, "hold"))
      : scene.materials.map((material, index) => slot(
        material, index, "layout", index === 0, scene.materials.length > 1 ? "loop" : "hold",
      ));
  const background = scene.rendererId === "collage" ? resolveBackground(scene, previousScene) : undefined;
  const materialSlots = background?.kind === "material" ? [...slots, background.slot]
    : slots;
  return {
    identity: `${sceneVisualIdentity(scene)}:${background?.kind === "previous-scene-frame" && previousScene
      ? sceneVisualIdentity(previousScene) : ""}`,
    scene,
    slots,
    background,
    requiredResourceIds: [
      ...materialSlots.flatMap(resourceIdsForSlot),
      ...(background?.kind === "previous-scene-frame" ? [`${scene.id}:previous-scene-frame`] : []),
    ],
  };
}

export function resourceIdsForSlot(value: ScenePlaybackSlot): readonly string[] {
  const visual = `${value.id}:visual`;
  return value.material.kind === "video" && value.audioEnabled && value.material.audioTrack
    ? [visual, `${value.id}:audio`] : [visual];
}

function resolveBackground(scene: Scene, previousScene: Scene | undefined): ScenePlaybackBackground | undefined {
  if (scene.collageBackground?.source === "material") return {
    kind: "material",
    mode: "custom-material",
    treated: false,
    slot: slot(scene.collageBackground.material, 0, "collage-background", false, "hold"),
  };
  const first = scene.materials[0];
  const fallback = first ? slot(first, 0, "collage-background", false, "hold") : undefined;
  if (previousScene) return {
    kind: "previous-scene-frame", mode: "previous-scene", treated: true, scene: previousScene, fallback,
  };
  return fallback ? { kind: "material", mode: "card-fallback", treated: true, slot: fallback } : undefined;
}

function slot(
  material: SceneMaterial,
  index: number,
  role: ScenePlaybackSlotRole,
  audioEnabled: boolean,
  endBehavior: ScenePlaybackEndBehavior,
): ScenePlaybackSlot {
  return { id: `${role}:${index}:${material.id}`, material, index, role, audioEnabled, endBehavior };
}
