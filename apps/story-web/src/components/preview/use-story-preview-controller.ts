import { useCallback, useEffect, useReducer, useRef } from "react";
import type { StoryTimeline } from "../../api.js";
import { usePlaybackClock } from "../editor/use-looping-scene-time.js";
import {
  createStoryPreviewMachine, reduceStoryPreview,
  type StoryPreviewSnapshot, type StoryPreviewStatus,
} from "./story-preview-machine.js";

export type { StoryPreviewSnapshot, StoryPreviewStatus } from "./story-preview-machine.js";

interface UseStoryPreviewControllerOptions {
  readonly timeline: StoryTimeline;
  readonly onCompleted: () => void;
}

export function useStoryPreviewController({ timeline, onCompleted }: UseStoryPreviewControllerOptions) {
  const [machine, dispatch] = useReducer(
    (state: ReturnType<typeof createStoryPreviewMachine>, action: Parameters<typeof reduceStoryPreview>[1]) =>
      reduceStoryPreview(state, action, timeline),
    timeline,
    createStoryPreviewMachine,
  );
  const completedPasses = useRef(machine.completedPasses);
  const completionCallback = useRef(onCompleted);
  completionCallback.current = onCompleted;

  useEffect(() => {
    dispatch({ type: "timeline-revised", timeline });
  }, [timeline]);

  usePlaybackClock(machine.status === "playing", (elapsedSeconds) => {
    dispatch({ type: "tick", elapsedSeconds });
  });

  useEffect(() => {
    if (machine.completedPasses === completedPasses.current) return;
    completedPasses.current = machine.completedPasses;
    completionCallback.current();
  }, [machine.completedPasses]);

  useEffect(() => {
    const pauseForBackground = () => dispatch({ type: "pause" });
    const onVisibility = () => { if (document.visibilityState === "hidden") pauseForBackground(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pauseForBackground);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pauseForBackground);
    };
  }, []);

  const play = useCallback(() => dispatch({ type: "play" }), []);
  const pause = useCallback(() => dispatch({ type: "pause" }), []);
  const seek = useCallback((playheadSeconds: number) => dispatch({ type: "seek", playheadSeconds }), []);
  const retry = useCallback(() => dispatch({ type: "retry" }), []);
  const onSceneReady = useCallback((timelineIndex: number) => dispatch({ type: "scene-ready", timelineIndex }), []);
  const onSceneWaiting = useCallback((timelineIndex: number) => dispatch({ type: "scene-waiting", timelineIndex }), []);
  const onSceneFailed = useCallback((timelineIndex: number) => dispatch({ type: "scene-failed", timelineIndex }), []);
  const onUnexpectedPause = useCallback(
    (timelineIndex: number) => dispatch({ type: "unexpected-pause", timelineIndex }),
    [],
  );
  const snapshot: StoryPreviewSnapshot = {
    status: machine.status,
    playheadSeconds: machine.playheadSeconds,
    currentTimelineIndex: machine.currentTimelineIndex,
    pendingTimelineIndex: machine.pendingTimelineIndex,
    retryKey: machine.retryKey,
    revisionReset: machine.revisionReset,
  };
  return { snapshot, play, pause, seek, retry, onSceneReady, onSceneWaiting, onSceneFailed, onUnexpectedPause };
}
