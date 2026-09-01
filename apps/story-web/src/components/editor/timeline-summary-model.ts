import type { StoryTimeline } from "../../api.js";

export function formatTimelineDuration(durationSeconds: number): string {
  const centiseconds = Math.round(durationSeconds * 100);
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor(centiseconds / 6_000) % 60;
  const seconds = Math.floor(centiseconds / 100) % 60;
  const fraction = centiseconds % 100;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

export function getTimelineProblems(timeline: StoryTimeline) {
  return {
    emptySceneIds: timeline.warnings.map(({ sceneId }) => sceneId),
    exceededLimits: timeline.formatLimits.filter(({ status }) => status === "exceeded"),
    count: timeline.warnings.length + timeline.formatLimits.filter(({ status }) => status === "exceeded").length,
  };
}
