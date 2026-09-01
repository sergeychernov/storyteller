import type { StoryTimeline } from "../../api.js";

type TimelineScene = StoryTimeline["scenes"][number];

export interface PreviewPosition {
  readonly timelineIndex: number;
  readonly scene: TimelineScene;
  readonly localTimeSeconds: number;
}

export function playableTimelineIndexes(timeline: StoryTimeline): readonly number[] {
  return timeline.scenes.flatMap((scene, index) => scene.durationSeconds > 0 ? [index] : []);
}

export function firstPlayableTimelineIndex(timeline: StoryTimeline): number | undefined {
  return playableTimelineIndexes(timeline)[0];
}

export function nextPlayableTimelineIndex(timeline: StoryTimeline, timelineIndex: number): number | undefined {
  return playableTimelineIndexes(timeline).find((index) => index > timelineIndex);
}

/** Hard-cut semantics: an exact shared boundary belongs to the following non-empty scene. */
export function positionAtPlayhead(timeline: StoryTimeline, playheadSeconds: number): PreviewPosition | undefined {
  const indexes = playableTimelineIndexes(timeline);
  if (!indexes.length) return undefined;
  const playhead = clampPlayhead(timeline, playheadSeconds);
  const timelineIndex = indexes.find((index) => {
    const scene = timeline.scenes[index]!;
    return playhead >= scene.startSeconds && playhead < scene.endSeconds;
  }) ?? indexes.at(-1)!;
  const scene = timeline.scenes[timelineIndex]!;
  return {
    timelineIndex,
    scene,
    localTimeSeconds: Math.min(scene.durationSeconds, Math.max(0, playhead - scene.startSeconds)),
  };
}

export function clampPlayhead(timeline: StoryTimeline, playheadSeconds: number): number {
  if (!Number.isFinite(playheadSeconds)) return 0;
  return Math.min(timeline.totalDurationSeconds, Math.max(0, playheadSeconds));
}

export function formatPreviewClock(durationSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const seconds = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function timelineMatchesStory(timeline: StoryTimeline, story: { readonly id: string; readonly revision: number }): boolean {
  return timeline.storyId === story.id && timeline.revision === story.revision;
}
