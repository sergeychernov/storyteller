import { DomainError } from "./errors.js";
import type { AssetRef, Narration, Scene, Story } from "./model.js";

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
  return changed(story, { scenes: [...story.scenes, { id: sceneId, materials: [], render: { status: "idle" } }] });
}

export function addMaterial(story: Story, sceneId: string, material: AssetRef): Story {
  return updateScene(story, sceneId, (scene) => {
    if (scene.materials.some(({ id }) => id === material.id)) throw new DomainError(`material already exists: ${material.id}`);
    return { ...scene, materials: [...scene.materials, material], render: { status: "idle" } };
  });
}

export function removeMaterial(story: Story, sceneId: string, materialId: string): Story {
  return updateScene(story, sceneId, (scene) => ({
    ...scene,
    materials: scene.materials.filter(({ id }) => id !== materialId),
    render: { status: "idle" },
  }));
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
