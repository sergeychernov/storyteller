import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoryTimeline } from "../../api.js";
import { PreviewScrubber } from "./PreviewScrubber.js";

const timeline: StoryTimeline = {
  storyId: "story", revision: 1, sceneOrder: ["one", "empty", "two", "three"],
  scenes: [
    { sceneId: "one", index: 0, materialIds: ["a"], startSeconds: 0, endSeconds: 2, durationSeconds: 2, durationSource: "scene" },
    { sceneId: "empty", index: 1, materialIds: [], startSeconds: 2, endSeconds: 2, durationSeconds: 0, durationSource: "empty" },
    { sceneId: "two", index: 2, materialIds: ["b"], startSeconds: 2, endSeconds: 5, durationSeconds: 3, durationSource: "scene" },
    { sceneId: "three", index: 3, materialIds: ["c"], startSeconds: 5, endSeconds: 10, durationSeconds: 5, durationSource: "scene" },
  ],
  totalDurationSeconds: 10, transitionOverlapSeconds: 0, warnings: [], formatLimits: [],
};

describe("PreviewScrubber", () => {
  it("places one tick at each unique scene boundary", () => {
    const { container } = render(<PreviewScrubber
      timeline={timeline}
      value={3}
      disabled={false}
      label="Total duration"
      onChange={vi.fn()}
    />);

    const slider = screen.getByRole<HTMLInputElement>("slider", { name: "Total duration" });
    expect(slider.value).toBe("3");
    expect(slider.step).toBe("any");
    const ticks = [...container.querySelectorAll<HTMLElement>("[data-preview-scene-boundary]")];
    expect(ticks.map((tick) => tick.dataset.previewSceneBoundary)).toEqual(["2", "5"]);
    expect(ticks.map(({ style }) => style.left)).toEqual(["20%", "50%"]);
    expect(container.querySelector<HTMLElement>("[data-preview-scrubber-progress]")?.style.width).toBe("30%");
  });
});
