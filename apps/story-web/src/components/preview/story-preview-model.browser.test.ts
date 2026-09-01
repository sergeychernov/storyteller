import { describe, expect, it } from "vitest";
import type { StoryTimeline } from "../../api.js";
import {
  clampPlayhead, firstPlayableTimelineIndex, formatPreviewClock, nextPlayableTimelineIndex,
  playableTimelineIndexes, positionAtPlayhead, timelineMatchesStory,
} from "./story-preview-model.js";

const timeline: StoryTimeline = {
  storyId: "story-1",
  revision: 7,
  sceneOrder: ["empty-1", "video", "empty-2", "photo"],
  scenes: [
    { sceneId: "empty-1", index: 0, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, durationSource: "empty" },
    { sceneId: "video", index: 1, materialIds: ["video-1"], startSeconds: 0, endSeconds: 2.75, durationSeconds: 2.75, durationSource: "trim" },
    { sceneId: "empty-2", index: 2, materialIds: [], startSeconds: 2.75, endSeconds: 2.75, durationSeconds: 0, durationSource: "empty" },
    { sceneId: "photo", index: 3, materialIds: ["photo-1"], startSeconds: 2.75, endSeconds: 7.75, durationSeconds: 5, durationSource: "scene" },
  ],
  totalDurationSeconds: 7.75,
  transitionOverlapSeconds: 0,
  warnings: [{ code: "empty_scene", sceneId: "empty-1" }, { code: "empty_scene", sceneId: "empty-2" }],
  formatLimits: [],
};

describe("story preview timeline model", () => {
  it("skips empty scenes without changing stored scene indexes", () => {
    expect(playableTimelineIndexes(timeline)).toEqual([1, 3]);
    expect(firstPlayableTimelineIndex(timeline)).toBe(1);
    expect(nextPlayableTimelineIndex(timeline, 1)).toBe(3);
    expect(nextPlayableTimelineIndex(timeline, 3)).toBeUndefined();
  });

  it("uses exact server trim boundaries and hard-cut ownership", () => {
    expect(positionAtPlayhead(timeline, 0)).toMatchObject({ timelineIndex: 1, localTimeSeconds: 0 });
    expect(positionAtPlayhead(timeline, 2.749)).toMatchObject({ timelineIndex: 1, localTimeSeconds: 2.749 });
    expect(positionAtPlayhead(timeline, 2.75)).toMatchObject({ timelineIndex: 3, localTimeSeconds: 0 });
    expect(positionAtPlayhead(timeline, 7.75)).toMatchObject({ timelineIndex: 3, localTimeSeconds: 5 });
  });

  it("clamps seek values and compares the authoritative revision", () => {
    expect(clampPlayhead(timeline, -10)).toBe(0);
    expect(clampPlayhead(timeline, 100)).toBe(7.75);
    expect(clampPlayhead(timeline, Number.NaN)).toBe(0);
    expect(timelineMatchesStory(timeline, { id: "story-1", revision: 7 })).toBe(true);
    expect(timelineMatchesStory(timeline, { id: "story-1", revision: 8 })).toBe(false);
  });

  it("formats clocks without rounding past a boundary", () => {
    expect(formatPreviewClock(0)).toBe("00:00");
    expect(formatPreviewClock(59.99)).toBe("00:59");
    expect(formatPreviewClock(3_661)).toBe("1:01:01");
  });
});
