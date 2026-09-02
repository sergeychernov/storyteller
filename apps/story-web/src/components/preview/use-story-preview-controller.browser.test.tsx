import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryTimeline } from "../../api.js";
import { useStoryPreviewController } from "./use-story-preview-controller.js";

const timeline: StoryTimeline = {
  storyId: "story-1", revision: 1, sceneOrder: ["one", "empty", "two"],
  scenes: [
    { sceneId: "one", index: 0, materialIds: ["a"], startSeconds: 0, endSeconds: 1, durationSeconds: 1, durationSource: "scene" },
    { sceneId: "empty", index: 1, materialIds: [], startSeconds: 1, endSeconds: 1, durationSeconds: 0, durationSource: "empty" },
    { sceneId: "two", index: 2, materialIds: ["b"], startSeconds: 1, endSeconds: 3, durationSeconds: 2, durationSource: "scene" },
  ],
  totalDurationSeconds: 3, transitionOverlapSeconds: 0,
  warnings: [{ code: "empty_scene", sceneId: "empty" }], formatLimits: [],
};

let animationFrame: FrameRequestCallback | undefined;

beforeEach(() => {
  animationFrame = undefined;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFrame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function frame(milliseconds: number) {
  const callback = animationFrame;
  if (!callback) throw new Error("animation frame was not requested");
  act(() => callback(milliseconds));
}

describe("story preview controller", () => {
  it("buffers on a hard cut, keeps the old scene, and resumes only when the next scene is ready", () => {
    const completed = vi.fn();
    const { result } = renderHook(() => useStoryPreviewController({ timeline, onCompleted: completed }));
    act(() => result.current.onSceneReady(0));
    act(() => result.current.play());
    frame(1_000);

    expect(result.current.snapshot).toMatchObject({
      status: "buffering", playheadSeconds: 1, currentTimelineIndex: 0, pendingTimelineIndex: 2,
    });
    act(() => result.current.onSceneReady(2));
    expect(result.current.snapshot).toMatchObject({ status: "playing", currentTimelineIndex: 2, pendingTimelineIndex: undefined });
    expect(completed).not.toHaveBeenCalled();
  });

  it("pauses clocks on media waiting, supports retry without skipping, and preserves playback intent", () => {
    const { result } = renderHook(() => useStoryPreviewController({ timeline, onCompleted: vi.fn() }));
    act(() => result.current.onSceneReady(0));
    act(() => result.current.play());
    act(() => result.current.onSceneWaiting(0));
    expect(result.current.snapshot.status).toBe("buffering");
    act(() => result.current.onSceneReady(0));
    expect(result.current.snapshot.status).toBe("playing");

    act(() => result.current.onSceneFailed(0));
    expect(result.current.snapshot.status).toBe("failed");
    const retryKey = result.current.snapshot.retryKey;
    act(() => result.current.retry());
    expect(result.current.snapshot).toMatchObject({ status: "buffering", retryKey: retryKey + 1 });
    act(() => result.current.onSceneReady(0));
    expect(result.current.snapshot.status).toBe("playing");
  });

  it("does not count seek as completion, but emits once per completed playback pass and supports replay", () => {
    const completed = vi.fn();
    const { result } = renderHook(() => useStoryPreviewController({ timeline, onCompleted: completed }));
    act(() => result.current.onSceneReady(0));
    act(() => result.current.onSceneReady(2));
    act(() => result.current.seek(3));
    expect(result.current.snapshot.status).toBe("completed");
    expect(completed).not.toHaveBeenCalled();

    const seekRetryKey = result.current.snapshot.retryKey;
    act(() => result.current.play());
    expect(result.current.snapshot).toMatchObject({
      status: "buffering", playheadSeconds: 0, currentTimelineIndex: 0,
      pendingTimelineIndex: 0, retryKey: seekRetryKey + 1,
    });
    act(() => result.current.onSceneReady(0));
    expect(result.current.snapshot.status).toBe("playing");
    frame(1_000);
    expect(result.current.snapshot).toMatchObject({ status: "buffering", pendingTimelineIndex: 2 });
    act(() => result.current.onSceneReady(2));
    frame(2_000);
    expect(result.current.snapshot).toMatchObject({
      status: "completed", playheadSeconds: 0, currentTimelineIndex: 0, pendingTimelineIndex: undefined,
    });
    expect(completed).toHaveBeenCalledTimes(1);

    act(() => result.current.onSceneReady(0));
    act(() => result.current.play());
    expect(result.current.snapshot.status).toBe("playing");
    frame(1_000);
    expect(result.current.snapshot.status).toBe("buffering");
    act(() => result.current.onSceneReady(2));
    frame(2_000);
    expect(completed).toHaveBeenCalledTimes(2);
  });

  it("uses the latest completion callback when it changes during playback", () => {
    const initialCompleted = vi.fn();
    const latestCompleted = vi.fn();
    const { result, rerender } = renderHook(
      ({ onCompleted }) => useStoryPreviewController({ timeline, onCompleted }),
      { initialProps: { onCompleted: initialCompleted } },
    );
    act(() => result.current.onSceneReady(0));
    act(() => result.current.onSceneReady(2));
    act(() => result.current.play());

    rerender({ onCompleted: latestCompleted });
    frame(1_000);
    frame(3_000);

    expect(result.current.snapshot.status).toBe("completed");
    expect(initialCompleted).not.toHaveBeenCalled();
    expect(latestCompleted).toHaveBeenCalledTimes(1);
  });

  it("a new revision returns to zero and requires a fresh Play", () => {
    const revised = { ...timeline, revision: 2 };
    const { result, rerender } = renderHook(({ value }) => useStoryPreviewController({ timeline: value, onCompleted: vi.fn() }), {
      initialProps: { value: timeline },
    });
    act(() => result.current.onSceneReady(0));
    act(() => result.current.play());
    rerender({ value: revised });
    expect(result.current.snapshot).toMatchObject({ status: "ready", playheadSeconds: 0, revisionReset: true });
    act(() => result.current.play());
    expect(result.current.snapshot).toMatchObject({ status: "buffering", pendingTimelineIndex: 0 });
  });
});
