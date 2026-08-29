import { DomainError } from "./errors.js";
import { getLayoutOptions } from "./layout.js";
import type { FocusPoint, Narration, Scene, SceneMaterial, SceneMotion, Story } from "./model.js";
import { defaultSingleImageMotion, getSceneMotionOptions } from "./scene-motion.js";
import { centeredFocusPoint } from "./still-image-motion.js";

export function createStory(input: { id: string; profileId: string; title?: string }): Story {
  return {
    ...input,
    status: "draft",
    scenes: [],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
    revision: 1,
  };
}

export function addScene(story: Story, sceneId: string): Story {
  assertEditable(story);
  if (story.scenes.some(({ id }) => id === sceneId)) throw new DomainError(`scene already exists: ${sceneId}`);
  return changed(story, { scenes: [...story.scenes, {
    id: sceneId, materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" },
  }] });
}

export function removeScene(story: Story, sceneId: string): Story {
  assertEditable(story);
  assertScene(story, sceneId);
  return changed(story, {
    scenes: story.scenes.filter(({ id }) => id !== sceneId),
    narrations: story.narrations.filter(({ fromSceneId }) => fromSceneId !== sceneId),
  });
}

export function addMaterial(story: Story, sceneId: string, material: SceneMaterial): Story {
  return updateScene(story, sceneId, (scene) => {
    if (scene.materials.some(({ id }) => id === material.id)) throw new DomainError(`material already exists: ${material.id}`);
    return resetMaterialPresentation({ ...scene, materials: [...scene.materials, material] });
  });
}

export function removeMaterial(story: Story, sceneId: string, materialId: string): Story {
  return updateScene(story, sceneId, (scene) => {
    if (!scene.materials.some(({ id }) => id === materialId)) throw new DomainError(`unknown material: ${materialId}`);
    return resetMaterialPresentation({ ...scene, materials: scene.materials.filter(({ id }) => id !== materialId) });
  });
}

export function replaceMaterial(story: Story, sceneId: string, material: SceneMaterial): Story {
  return updateScene(story, sceneId, (scene) => {
    if (!scene.materials.some(({ id }) => id === material.id)) throw new DomainError(`unknown material: ${material.id}`);
    return resetMaterialPresentation({
      ...scene,
      materials: scene.materials.map((current) => current.id === material.id ? material : current),
    });
  });
}

export function reorderMaterials(story: Story, sceneId: string, materialIds: readonly string[]): Story {
  return updateScene(story, sceneId, (scene) => {
    if (materialIds.length !== scene.materials.length || new Set(materialIds).size !== materialIds.length) {
      throw new DomainError("material order must contain every material exactly once");
    }
    const materialsById = new Map(scene.materials.map((material) => [material.id, material]));
    const materials = materialIds.map((id) => materialsById.get(id));
    if (materials.some((material) => !material)) throw new DomainError("material order contains an unknown material");
    return resetLayout({ ...scene, materials: materials as SceneMaterial[] });
  });
}

/** The persisted scenes array is the authoritative editorial order. */
export function reorderScenes(story: Story, sceneIds: readonly string[]): Story {
  assertEditable(story);
  if (sceneIds.length !== story.scenes.length || new Set(sceneIds).size !== sceneIds.length) {
    throw new DomainError("scene order must contain every scene exactly once");
  }
  const byId = new Map(story.scenes.map((scene) => [scene.id, scene]));
  const scenes = sceneIds.map((id) => {
    const scene = byId.get(id);
    if (!scene) throw new DomainError(`unknown scene: ${id}`);
    return scene;
  });
  // Reordering does not change individual scene renders or narration anchors.
  return { ...changed(story, { scenes }), music: { ...story.music, applied: false } };
}

export interface MoveSceneMaterialsInput {
  readonly materialIds: readonly string[];
  readonly targetSceneId: string;
  /** Zero-based insertion index in the destination before this operation. */
  readonly targetIndex: number;
}

/** Move references in one revision; never copy, delete or regenerate media files. */
export function moveSceneMaterials(story: Story, sourceSceneId: string, input: MoveSceneMaterialsInput): Story {
  assertEditable(story);
  assertScene(story, sourceSceneId);
  assertScene(story, input.targetSceneId);
  if (sourceSceneId === input.targetSceneId) throw new DomainError("source and target scenes must differ; use material-order within a scene");
  const source = story.scenes.find(({ id }) => id === sourceSceneId)!;
  const target = story.scenes.find(({ id }) => id === input.targetSceneId)!;
  const movingIds = new Set(input.materialIds);
  if (!movingIds.size || movingIds.size !== input.materialIds.length) {
    throw new DomainError("materialIds must contain distinct materials");
  }
  if (!Number.isInteger(input.targetIndex) || input.targetIndex < 0 || input.targetIndex > target.materials.length) {
    throw new DomainError("targetIndex must be an insertion position in the target scene");
  }
  const byId = new Map(source.materials.map((material) => [material.id, material]));
  const moving = input.materialIds.map((id) => {
    const material = byId.get(id);
    if (!material) throw new DomainError(`unknown material: ${id}`);
    if (target.materials.some((existing) => existing.id === id)) throw new DomainError(`material already exists in target: ${id}`);
    return material;
  });
  const scenes = story.scenes.map((scene) => {
    if (scene.id === source.id) return resetMaterialPresentation({
      ...scene, materials: scene.materials.filter(({ id }) => !movingIds.has(id)),
    });
    if (scene.id === target.id) return resetMaterialPresentation({
      ...scene, materials: [...scene.materials.slice(0, input.targetIndex), ...moving, ...scene.materials.slice(input.targetIndex)],
    });
    return scene;
  });
  return { ...changed(story, { scenes }), music: { ...story.music, applied: false } };
}

export function configureScene(story: Story, sceneId: string, input: {
  durationSeconds?: number;
  layoutId?: string | null;
  motion?: SceneMotion;
  focusPoint?: FocusPoint;
}): Story {
  return updateScene(story, sceneId, (scene) => {
    const durationSeconds = input.durationSeconds ?? scene.durationSeconds;
    if (durationSeconds < 3 || durationSeconds > 15) throw new DomainError("scene duration must be between 3 and 15 seconds");
    if (input.layoutId) {
      const available = getLayoutOptions(scene.materials);
      if (!available.some(({ id }) => id === input.layoutId)) throw new DomainError(`layout is not available: ${input.layoutId}`);
    }
    const motion = input.motion ?? scene.motion;
    if (!getSceneMotionOptions(scene.materials).includes(motion)) {
      throw new DomainError(`motion is not available for this material orientation: ${motion}`);
    }
    if (input.focusPoint) {
      if (scene.rendererId !== "still-image" || scene.materials.length !== 1 || scene.materials[0]?.kind !== "image") {
        throw new DomainError("focus point is available only for the single-image renderer");
      }
      if (![input.focusPoint.x, input.focusPoint.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
        throw new DomainError("focus point coordinates must be between 0 and 1");
      }
    }
    const { layoutId: _oldLayout, ...withoutLayout } = scene;
    return {
      ...withoutLayout,
      durationSeconds,
      motion,
      ...(input.focusPoint ? { focusPoint: input.focusPoint } : {}),
      ...(input.layoutId === undefined ? (scene.layoutId ? { layoutId: scene.layoutId } : {}) : input.layoutId ? { layoutId: input.layoutId } : {}),
      render: { status: "idle" },
    };
  });
}

export function selectRenderer(story: Story, sceneId: string, rendererId: string): Story {
  if (!rendererId.trim()) throw new DomainError("renderer id is required");
  return updateScene(story, sceneId, (scene) => ({ ...scene, rendererId, render: { status: "idle" } }));
}

export function setSceneTitle(story: Story, sceneId: string, title: string | null): Story {
  return updateScene(story, sceneId, (scene) => {
    const { title: _oldTitle, ...withoutTitle } = scene;
    return title?.trim()
      ? { ...withoutTitle, title: title.trim(), render: { status: "idle" } }
      : { ...withoutTitle, render: { status: "idle" } };
  });
}

export function addNarration(story: Story, narration: Narration): Story {
  assertEditable(story);
  assertScene(story, narration.fromSceneId);
  if (story.narrations.some(({ id }) => id === narration.id)) throw new DomainError(`narration already exists: ${narration.id}`);
  return changed(story, { narrations: [...story.narrations, narration] });
}

export function removeNarration(story: Story, narrationId: string): Story {
  assertEditable(story);
  return changed(story, { narrations: story.narrations.filter(({ id }) => id !== narrationId) });
}

function updateScene(story: Story, sceneId: string, update: (scene: Scene) => Scene): Story {
  assertEditable(story);
  assertScene(story, sceneId);
  return changed(story, { scenes: story.scenes.map((scene) => scene.id === sceneId ? update(scene) : scene) });
}

function assertScene(story: Story, sceneId: string): void {
  if (!story.scenes.some(({ id }) => id === sceneId)) throw new DomainError(`unknown scene: ${sceneId}`);
}

function assertEditable(story: Story): void {
  if (story.status !== "draft" && story.status !== "ready") throw new DomainError(`story cannot be edited while ${story.status}`);
}

function changed(story: Story, change: Partial<Pick<Story, "scenes" | "narrations">>): Story {
  return { ...story, ...change, status: "draft", revision: story.revision + 1 };
}

function resetLayout(scene: Scene): Scene {
  const { layoutId: _layoutId, ...withoutLayout } = scene;
  return { ...withoutLayout, render: { status: "idle" } };
}

function resetMaterialPresentation(scene: Scene): Scene {
  const reset = resetLayout(scene);
  if (reset.materials.length !== 1) {
    const { focusPoint: _focusPoint, rendererId: _rendererId, ...withoutRenderer } = reset;
    return { ...withoutRenderer, motion: "none" };
  }
  const material = reset.materials[0]!;
  const { focusPoint: _focusPoint, rendererId: _rendererId, ...withoutFocus } = reset;
  return {
    ...withoutFocus,
    layoutId: "full-frame",
    motion: defaultSingleImageMotion(material),
    ...(material.kind === "image" ? { rendererId: "still-image", focusPoint: centeredFocusPoint } : {}),
  };
}
