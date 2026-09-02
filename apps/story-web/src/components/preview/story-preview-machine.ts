import type { StoryTimeline } from "../../api.js";
import {
  clampPlayhead, firstPlayableTimelineIndex, nextPlayableTimelineIndex, positionAtPlayhead,
} from "./story-preview-model.js";

export type StoryPreviewStatus = "ready" | "playing" | "paused" | "buffering" | "failed" | "completed";

export interface StoryPreviewSnapshot {
  readonly status: StoryPreviewStatus;
  readonly playheadSeconds: number;
  readonly currentTimelineIndex: number | undefined;
  readonly pendingTimelineIndex: number | undefined;
  readonly retryKey: number;
  readonly revisionReset: boolean;
}

export interface StoryPreviewMachine extends StoryPreviewSnapshot {
  readonly timelineRevision: number;
  readonly readyScenes: readonly number[];
  readonly failedScenes: readonly number[];
  readonly resumeWhenReady: boolean;
  readonly completedPasses: number;
}

export type StoryPreviewAction =
  | { readonly type: "timeline-revised"; readonly timeline: StoryTimeline }
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "seek"; readonly playheadSeconds: number }
  | { readonly type: "tick"; readonly elapsedSeconds: number }
  | { readonly type: "retry" }
  | { readonly type: "scene-ready"; readonly timelineIndex: number }
  | { readonly type: "scene-waiting"; readonly timelineIndex: number }
  | { readonly type: "scene-failed"; readonly timelineIndex: number }
  | { readonly type: "unexpected-pause"; readonly timelineIndex: number };

export function createStoryPreviewMachine(timeline: StoryTimeline): StoryPreviewMachine {
  return {
    status: "ready",
    playheadSeconds: 0,
    currentTimelineIndex: firstPlayableTimelineIndex(timeline),
    pendingTimelineIndex: undefined,
    retryKey: 0,
    revisionReset: false,
    timelineRevision: timeline.revision,
    readyScenes: [],
    failedScenes: [],
    resumeWhenReady: false,
    completedPasses: 0,
  };
}

export function reduceStoryPreview(
  state: StoryPreviewMachine,
  action: StoryPreviewAction,
  timeline: StoryTimeline,
): StoryPreviewMachine {
  if (action.type === "timeline-revised") {
    if (state.timelineRevision === action.timeline.revision) return state;
    return {
      ...createStoryPreviewMachine(action.timeline),
      retryKey: state.retryKey + 1,
      completedPasses: state.completedPasses,
      revisionReset: true,
    };
  }
  if (action.type === "play") return play(state, timeline);
  if (action.type === "pause") return pause(state);
  if (action.type === "seek") return seek(state, action.playheadSeconds, timeline);
  if (action.type === "tick") return tick(state, action.elapsedSeconds, timeline);
  if (action.type === "retry") return retry(state);
  if (action.type === "scene-ready") return sceneReady(state, action.timelineIndex);
  if (action.type === "scene-waiting") return sceneWaiting(state, action.timelineIndex);
  if (action.type === "scene-failed") return sceneFailed(state, action.timelineIndex);
  return unexpectedPause(state, action.timelineIndex);
}

function play(state: StoryPreviewMachine, timeline: StoryTimeline): StoryPreviewMachine {
  if (state.currentTimelineIndex === undefined || timeline.totalDurationSeconds <= 0 || state.status === "failed") return state;
  const target = state.status === "completed" && state.playheadSeconds !== 0
    ? {
      ...state,
      playheadSeconds: 0,
      currentTimelineIndex: firstPlayableTimelineIndex(timeline),
      retryKey: state.retryKey + 1,
      readyScenes: [],
      failedScenes: [],
    }
    : state;
  return moveTo(target, target.currentTimelineIndex!, target.playheadSeconds, true, false, timeline);
}

function pause(state: StoryPreviewMachine): StoryPreviewMachine {
  if (state.status !== "playing" && state.status !== "buffering") return state;
  return { ...state, status: "paused", pendingTimelineIndex: undefined, resumeWhenReady: false };
}

function seek(state: StoryPreviewMachine, seconds: number, timeline: StoryTimeline): StoryPreviewMachine {
  const playheadSeconds = clampPlayhead(timeline, seconds);
  const position = positionAtPlayhead(timeline, playheadSeconds);
  if (!position) return state;
  const resumeWhenReady = state.status === "playing" || (state.status === "buffering" && state.resumeWhenReady);
  if (playheadSeconds >= timeline.totalDurationSeconds) return complete(state, timeline, false, position.timelineIndex);
  return moveTo(state, position.timelineIndex, playheadSeconds, resumeWhenReady, false, timeline);
}

function tick(state: StoryPreviewMachine, elapsedSeconds: number, timeline: StoryTimeline): StoryPreviewMachine {
  if (state.status !== "playing" || state.currentTimelineIndex === undefined) return state;
  const scene = timeline.scenes[state.currentTimelineIndex];
  if (!scene) return state;
  const target = clampPlayhead(timeline, state.playheadSeconds + Math.max(0, elapsedSeconds));
  if (target < scene.endSeconds) return { ...state, playheadSeconds: target };
  const nextIndex = nextPlayableTimelineIndex(timeline, state.currentTimelineIndex);
  if (nextIndex === undefined) return complete(state, timeline, true);
  const boundary = timeline.scenes[nextIndex]!.startSeconds;
  return moveTo(state, nextIndex, boundary, true, true, timeline);
}

function moveTo(
  state: StoryPreviewMachine,
  timelineIndex: number,
  playheadSeconds: number,
  resumeWhenReady: boolean,
  keepCurrentWhileLoading: boolean,
  timeline: StoryTimeline,
): StoryPreviewMachine {
  // Readiness belongs to a mounted shell, not to a scene forever. Only current
  // and next survive; seeking back remounts older media and must prepare it again.
  const hasLiveResources = state.currentTimelineIndex === timelineIndex
    || state.currentTimelineIndex !== undefined
      && nextPlayableTimelineIndex(timeline, state.currentTimelineIndex) === timelineIndex;
  const failed = hasLiveResources && state.failedScenes.includes(timelineIndex);
  const ready = hasLiveResources && state.readyScenes.includes(timelineIndex);
  const waiting = !failed && !ready;
  return {
    ...state,
    status: failed ? "failed" : waiting ? "buffering" : resumeWhenReady ? "playing" : "paused",
    playheadSeconds,
    currentTimelineIndex: (failed || waiting) && keepCurrentWhileLoading ? state.currentTimelineIndex : timelineIndex,
    pendingTimelineIndex: failed || waiting ? timelineIndex : undefined,
    resumeWhenReady,
    revisionReset: false,
  };
}

function complete(
  state: StoryPreviewMachine,
  timeline: StoryTimeline,
  natural: boolean,
  currentTimelineIndex = firstPlayableTimelineIndex(timeline),
): StoryPreviewMachine {
  return {
    ...state,
    status: "completed",
    playheadSeconds: natural ? 0 : timeline.totalDurationSeconds,
    currentTimelineIndex,
    pendingTimelineIndex: undefined,
    retryKey: state.retryKey + (natural ? 1 : 0),
    readyScenes: natural ? [] : state.readyScenes,
    failedScenes: natural ? [] : state.failedScenes,
    resumeWhenReady: false,
    completedPasses: state.completedPasses + (natural ? 1 : 0),
    revisionReset: false,
  };
}

function retry(state: StoryPreviewMachine): StoryPreviewMachine {
  const target = state.pendingTimelineIndex ?? state.currentTimelineIndex;
  if (target === undefined) return state;
  return {
    ...state,
    status: "buffering",
    pendingTimelineIndex: target,
    retryKey: state.retryKey + 1,
    readyScenes: without(state.readyScenes, target),
    failedScenes: without(state.failedScenes, target),
  };
}

function sceneReady(state: StoryPreviewMachine, timelineIndex: number): StoryPreviewMachine {
  const next = {
    ...state,
    readyScenes: withValue(state.readyScenes, timelineIndex),
    failedScenes: without(state.failedScenes, timelineIndex),
  };
  if (state.status !== "buffering" || state.pendingTimelineIndex !== timelineIndex) return next;
  return {
    ...next,
    status: state.resumeWhenReady ? "playing" : "paused",
    currentTimelineIndex: timelineIndex,
    pendingTimelineIndex: undefined,
  };
}

function sceneWaiting(state: StoryPreviewMachine, timelineIndex: number): StoryPreviewMachine {
  const next = { ...state, readyScenes: without(state.readyScenes, timelineIndex) };
  if (state.currentTimelineIndex !== timelineIndex || state.status !== "playing") return next;
  return { ...next, status: "buffering", pendingTimelineIndex: timelineIndex, resumeWhenReady: true };
}

function sceneFailed(state: StoryPreviewMachine, timelineIndex: number): StoryPreviewMachine {
  const next = {
    ...state,
    readyScenes: without(state.readyScenes, timelineIndex),
    failedScenes: withValue(state.failedScenes, timelineIndex),
  };
  if (state.currentTimelineIndex !== timelineIndex && state.pendingTimelineIndex !== timelineIndex) return next;
  return {
    ...next,
    status: "failed",
    pendingTimelineIndex: timelineIndex,
    resumeWhenReady: state.status === "playing" || state.status === "buffering" ? true : state.resumeWhenReady,
  };
}

function unexpectedPause(state: StoryPreviewMachine, timelineIndex: number): StoryPreviewMachine {
  if (state.currentTimelineIndex !== timelineIndex || state.status !== "playing") return state;
  return { ...state, status: "paused", pendingTimelineIndex: undefined, resumeWhenReady: false };
}

function withValue(values: readonly number[], value: number): readonly number[] {
  return values.includes(value) ? values : [...values, value];
}

function without(values: readonly number[], value: number): readonly number[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : values;
}
