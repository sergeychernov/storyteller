import type { Scene, Story } from "./model.js";

/** Photos/layouts use scene timing; a single video uses its original-time trim. */
export function getSceneDurationSeconds(scene: Scene): number | undefined {
  const material = scene.materials[0];
  if (scene.materials.length !== 1 || material?.kind !== "video") return scene.durationSeconds;
  const trim = material.edit?.trim;
  const duration = trim ? trim.endSeconds - trim.startSeconds : material.sourceDurationSeconds ?? material.videoTrack?.durationSeconds;
  return duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : undefined;
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
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;
  readonly durationSeconds: number | null;
  readonly durationSource: "empty" | "scene" | "video" | "trim" | "unknown";
}

export interface StoryTimeline {
  readonly storyId: string;
  readonly revision: number;
  readonly sceneOrder: readonly string[];
  readonly scenes: readonly TimelineScene[];
  readonly totalDurationSeconds: number | null;
  /** Lower bound when a legacy video's duration is not known. */
  readonly knownDurationSeconds: number;
  /** Only hard cuts exist today. Never imply that an unrendered crossfade exists. */
  readonly transitionOverlapSeconds: 0;
  readonly warnings: readonly { readonly code: "empty_scene" | "unknown_video_duration"; readonly sceneId: string }[];
  readonly formatLimits: readonly (TimelineDurationLimit & {
    readonly status: "within_limit" | "exceeded" | "unknown";
    readonly excessSeconds: number;
    readonly isLowerBound: boolean;
  })[];
}

/** Derived from the stored order, never persisted as a second source of truth. */
export function buildStoryTimeline(story: Story, limits: readonly TimelineDurationLimit[] = []): StoryTimeline {
  let cursor: number | null = 0;
  let knownDurationSeconds = 0;
  const warnings: { code: "empty_scene" | "unknown_video_duration"; sceneId: string }[] = [];
  const scenes: TimelineScene[] = story.scenes.map((scene, index) => {
    const empty = scene.materials.length === 0;
    const video = scene.materials.length === 1 && scene.materials[0]?.kind === "video" ? scene.materials[0] : undefined;
    const duration = empty ? 0 : getSceneDurationSeconds(scene);
    const durationSeconds = duration === undefined ? null : seconds(duration);
    const startSeconds = cursor;
    cursor = cursor === null || durationSeconds === null ? null : seconds(cursor + durationSeconds);
    knownDurationSeconds = seconds(knownDurationSeconds + (durationSeconds ?? 0));
    if (empty) warnings.push({ code: "empty_scene", sceneId: scene.id });
    if (durationSeconds === null) warnings.push({ code: "unknown_video_duration", sceneId: scene.id });
    return {
      sceneId: scene.id, index, materialIds: scene.materials.map(({ id }) => id),
      startSeconds, endSeconds: cursor, durationSeconds,
      durationSource: empty ? "empty" : durationSeconds === null ? "unknown" : video ? video.edit?.trim ? "trim" : "video" : "scene",
    };
  });
  return {
    storyId: story.id, revision: story.revision, sceneOrder: story.scenes.map(({ id }) => id), scenes,
    totalDurationSeconds: cursor, knownDurationSeconds, transitionOverlapSeconds: 0, warnings,
    formatLimits: limits.map((limit) => {
      const excessSeconds = seconds(Math.max(0, knownDurationSeconds - limit.maxDurationSeconds));
      return {
        ...limit, status: excessSeconds > 0 ? "exceeded" : cursor === null ? "unknown" : "within_limit",
        excessSeconds, isLowerBound: cursor === null,
      };
    }),
  };
}

function seconds(value: number): number { return Number(value.toFixed(6)); }
