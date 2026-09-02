import { describe, expect, it } from "vitest";
import type { StoryTimeline } from "../../api.js";
import { createStoryPreviewMachine, reduceStoryPreview, type StoryPreviewAction } from "./story-preview-machine.js";

const timeline: StoryTimeline = {
  storyId: "story", revision: 1, sceneOrder: ["one", "two"],
  scenes: [
    { sceneId: "one", index: 0, materialIds: ["a"], startSeconds: 0, endSeconds: 1, durationSeconds: 1, durationSource: "scene" },
    { sceneId: "two", index: 1, materialIds: ["b"], startSeconds: 1, endSeconds: 3, durationSeconds: 2, durationSource: "scene" },
  ],
  totalDurationSeconds: 3, transitionOverlapSeconds: 0, warnings: [], formatLimits: [],
};

describe("story preview state machine", () => {
  it("removes a waiting scene from readiness and ignores recovery from another scene", () => {
    let state = createStoryPreviewMachine(timeline);
    const send = (action: StoryPreviewAction) => { state = reduceStoryPreview(state, action, timeline); };
    send({ type: "scene-ready", timelineIndex: 0 });
    send({ type: "scene-ready", timelineIndex: 1 });
    send({ type: "play" });
    send({ type: "scene-waiting", timelineIndex: 0 });
    expect(state).toMatchObject({ status: "buffering", pendingTimelineIndex: 0, readyScenes: [1] });

    send({ type: "scene-ready", timelineIndex: 1 });
    expect(state.status).toBe("buffering");
    send({ type: "scene-ready", timelineIndex: 0 });
    expect(state).toMatchObject({ status: "playing", pendingTimelineIndex: undefined });
  });

  it("counts only natural playing completion and resets all scene resources", () => {
    let state = createStoryPreviewMachine(timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 0 }, timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 1 }, timeline);
    state = reduceStoryPreview(state, { type: "seek", playheadSeconds: 3 }, timeline);
    expect(state.completedPasses).toBe(0);

    state = reduceStoryPreview(state, { type: "play" }, timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 0 }, timeline);
    state = reduceStoryPreview(state, { type: "tick", elapsedSeconds: 1 }, timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 1 }, timeline);
    state = reduceStoryPreview(state, { type: "tick", elapsedSeconds: 2 }, timeline);
    expect(state).toMatchObject({
      status: "completed", playheadSeconds: 0, currentTimelineIndex: 0,
      readyScenes: [], failedScenes: [], completedPasses: 1,
    });
  });

  it("preserves play intent when seeking while buffering", () => {
    let state = createStoryPreviewMachine(timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 0 }, timeline);
    state = reduceStoryPreview(state, { type: "play" }, timeline);
    state = reduceStoryPreview(state, { type: "scene-waiting", timelineIndex: 0 }, timeline);
    state = reduceStoryPreview(state, { type: "seek", playheadSeconds: 2 }, timeline);
    expect(state).toMatchObject({ status: "buffering", pendingTimelineIndex: 1, resumeWhenReady: true });
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 1 }, timeline);
    expect(state.status).toBe("playing");
  });

  it("prepares a previously played scene again after its shell was unmounted", () => {
    let state = createStoryPreviewMachine(timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 0 }, timeline);
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 1 }, timeline);
    state = reduceStoryPreview(state, { type: "play" }, timeline);
    state = reduceStoryPreview(state, { type: "tick", elapsedSeconds: 1 }, timeline);
    expect(state).toMatchObject({ status: "playing", currentTimelineIndex: 1 });

    state = reduceStoryPreview(state, { type: "seek", playheadSeconds: 0 }, timeline);
    expect(state).toMatchObject({
      status: "buffering", currentTimelineIndex: 0, pendingTimelineIndex: 0, resumeWhenReady: true,
    });
    state = reduceStoryPreview(state, { type: "scene-ready", timelineIndex: 0 }, timeline);
    expect(state).toMatchObject({ status: "playing", currentTimelineIndex: 0, pendingTimelineIndex: undefined });
  });
});
