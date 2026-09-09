import { getMaterialPresentation, type Scene, type SceneMaterial, type Story, type StoryTimeline } from "../../api.js";
import { buildScenePlaybackPlan } from "../editor/scene-playback-plan.js";
import { nextPlayableTimelineIndex, playableTimelineIndexes } from "./story-preview-model.js";

export type PreviewPreloadResource = {
  readonly id: string;
  readonly material: SceneMaterial;
  readonly audio: boolean;
  readonly warm: boolean;
} | { readonly id: string; readonly frame: Scene; readonly warm: boolean };

/** A time horizon handles short scenes; scene and estimated byte limits bound long/heavy stories. */
export function previewPreloadPlan(story: Story, timeline: StoryTimeline, current: number, constrained = false): PreviewPreloadResource[] {
  const indexes = playableTimelineIndexes(timeline).filter((index) => index >= current);
  const start = timeline.scenes[current]?.startSeconds ?? 0;
  const selected = indexes.filter((index, position) => position < (constrained ? 2 : 3)
    || !constrained && position < 5 && timeline.scenes[index]!.startSeconds < start + 15);
  const next = nextPlayableTimelineIndex(timeline, current);
  const resources = new Map<string, PreviewPreloadResource>();
  let bytes = 0;
  const budget = (constrained ? 24 : 96) * 1024 * 1024;
  for (const index of selected) {
    const scene = story.scenes.find(({ id }) => id === timeline.scenes[index]!.sceneId);
    if (!scene) continue;
    const plan = buildScenePlaybackPlan(scene, story.scenes[timeline.scenes[index]!.index - 1]);
    const warm = index !== current && index !== next;
    const add = (resource: PreviewPreloadResource, size: number) => {
      if (resources.has(resource.id)) return;
      if (warm && bytes + size > budget) return;
      bytes += size;
      resources.set(resource.id, resource);
    };
    const slots = [...plan.slots];
    if (plan.background?.kind === "material") slots.push(plan.background.slot);
    if (plan.background?.kind === "previous-scene-frame") {
      add({ id: `frame:${plan.background.scene.id}:${plan.identity}`, frame: plan.background.scene, warm }, 1080 * 1920 * 4);
      if (plan.background.fallback) slots.push(plan.background.fallback);
    }
    for (const slot of slots) {
      const material = slot.material;
      const presentation = getMaterialPresentation(material);
      add({ id: `visual:${material.id}:${presentation.storageKey}`, material, audio: false, warm },
        material.kind === "image" ? Math.max(presentation.sizeBytes, presentation.width * presentation.height * 4) : presentation.sizeBytes);
      if (slot.audioEnabled && material.kind === "video" && material.audioTrack) {
        add({ id: `audio:${material.id}:${material.audioTrack.storageKey}`, material, audio: true, warm }, material.audioTrack.sizeBytes);
      }
    }
  }
  return [...resources.values()];
}
