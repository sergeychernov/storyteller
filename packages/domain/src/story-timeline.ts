import type { Scene, Story } from "./model.js";

/** Photos/layouts use scene timing; a single video uses its original-time trim. */
export function getSceneDurationSeconds(scene: Scene): number {
  const material = scene.materials[0];
  if (scene.materials.length !== 1 || material?.kind !== "video") return scene.durationSeconds;
  const trim = material.edit?.trim;
  return trim ? trim.endSeconds - trim.startSeconds : material.sourceDurationSeconds;
}

export interface TimelineDurationLimit {
  readonly formatId: string;
  readonly maxDurationSeconds: number;
  readonly requiresVerifiedAccount: boolean;
}

export interface TimelineScene {
  readonly sceneId: string;
  readonly index: number;
  readonly materialIds: readonly string[];
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly durationSeconds: number;
  readonly durationSource: "empty" | "scene" | "video" | "trim";
}

export interface StoryTimeline {
  readonly storyId: string;
  readonly revision: number;
  readonly sceneOrder: readonly string[];
  readonly scenes: readonly TimelineScene[];
  readonly totalDurationSeconds: number;
  /** Only hard cuts exist today. Never imply that an unrendered crossfade exists. */
  readonly transitionOverlapSeconds: 0;
  readonly warnings: readonly { readonly code: "empty_scene"; readonly sceneId: string }[];
  readonly formatLimits: readonly (TimelineDurationLimit & {
    readonly status: "within_limit" | "exceeded";
    readonly excessSeconds: number;
  })[];
}

/** Derived from the stored order, never persisted as a second source of truth. */
export function buildStoryTimeline(story: Story, limits: readonly TimelineDurationLimit[] = []): StoryTimeline {
  let cursor = 0;
  const warnings: { code: "empty_scene"; sceneId: string }[] = [];
  const scenes: TimelineScene[] = story.scenes.map((scene, index) => {
    const empty = scene.materials.length === 0;
    const video = scene.materials.length === 1 && scene.materials[0]?.kind === "video" ? scene.materials[0] : undefined;
    const durationSeconds = empty ? 0 : seconds(getSceneDurationSeconds(scene));
    const startSeconds = cursor;
    cursor = seconds(cursor + durationSeconds);
    if (empty) warnings.push({ code: "empty_scene", sceneId: scene.id });
    return {
      sceneId: scene.id, index, materialIds: scene.materials.map(({ id }) => id),
      startSeconds, endSeconds: cursor, durationSeconds,
      durationSource: empty ? "empty" : video ? video.edit?.trim ? "trim" : "video" : "scene",
    };
  });
  return {
    storyId: story.id, revision: story.revision, sceneOrder: story.scenes.map(({ id }) => id), scenes,
    totalDurationSeconds: cursor, transitionOverlapSeconds: 0, warnings,
    formatLimits: limits.map((limit) => {
      const excessSeconds = seconds(Math.max(0, cursor - limit.maxDurationSeconds));
      return {
        ...limit, status: excessSeconds > 0 ? "exceeded" : "within_limit", excessSeconds,
      };
    }),
  };
}

function seconds(value: number): number { return Number(value.toFixed(6)); }
