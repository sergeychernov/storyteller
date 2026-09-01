import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Scene, StoryTimeline } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { SceneRail } from "./SceneRail.js";
import { TimelineSummary } from "./TimelineSummary.js";

const copy = getEditorCopy("en");

test("shows calculation and recoverable error states without requiring the editor to disappear", () => {
  const retry = vi.fn();
  const { rerender } = render(<TimelineSummary timeline={undefined} loading error={false} copy={copy} onRetry={retry} />);
  expect(screen.getByText("Calculating the timeline…")).toBeTruthy();

  rerender(<TimelineSummary timeline={undefined} loading={false} error copy={copy} onRetry={retry} />);
  expect(screen.getByRole("alert").textContent).toContain("The editor is still available");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});

test("shows exact duration, the problem count and only exceeded advisory formats", () => {
  render(<TimelineSummary timeline={timeline} loading={false} error={false} copy={copy} onRetry={() => undefined} />);

  expect(screen.getByText("1:00:13.46")).toBeTruthy();
  expect(screen.getByText("Problems: 2")).toBeTruthy();
  expect(screen.getByText("Empty scenes: 1")).toBeTruthy();
  expect(screen.getByText("YouTube Shorts: over by 57:13.46")).toBeTruthy();
  expect(screen.queryByText(/YouTube video/)).toBeNull();
});

test("marks an empty scene with visible text in the shared rail", () => {
  render(<SceneRail
    scenes={[emptyScene]}
    selectedId="empty"
    copy={copy}
    adding={false}
    onSelect={() => undefined}
    onAdd={() => undefined}
    variant="mobileTimeline"
    timeline={{ ...timeline, sceneOrder: ["empty"], scenes: [{
      sceneId: "empty", index: 0, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, durationSource: "empty",
    }], totalDurationSeconds: 0, formatLimits: [] }}
  />);

  expect(screen.getByText("Empty · 0 sec")).toBeTruthy();
  expect(screen.getByText("Empty scenes: 1")).toBeTruthy();
});

const timeline: StoryTimeline = {
  storyId: "story",
  revision: 3,
  sceneOrder: ["empty"],
  scenes: [],
  totalDurationSeconds: 3_613.456,
  transitionOverlapSeconds: 0,
  warnings: [{ code: "empty_scene", sceneId: "empty" }],
  formatLimits: [
    { formatId: "youtube-shorts", maxDurationSeconds: 180, requiresVerifiedAccount: false, status: "exceeded", excessSeconds: 3_433.456 },
    { formatId: "youtube-video", maxDurationSeconds: 900, requiresVerifiedAccount: false, status: "within_limit", excessSeconds: 0 },
    { formatId: "youtube-video-verified", maxDurationSeconds: 43_200, requiresVerifiedAccount: true, status: "within_limit", excessSeconds: 0 },
  ],
};

const emptyScene: Scene = {
  id: "empty", title: "Gap", materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" },
};
