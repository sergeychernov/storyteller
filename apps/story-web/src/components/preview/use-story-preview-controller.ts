import { useCallback, useEffect, useRef, useState } from "react";
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

interface UseStoryPreviewControllerOptions {
  readonly timeline: StoryTimeline;
  readonly onCompleted: () => void;
}

export function useStoryPreviewController({ timeline, onCompleted }: UseStoryPreviewControllerOptions) {
  const initialIndex = firstPlayableTimelineIndex(timeline);
  const [snapshot, setSnapshot] = useState<StoryPreviewSnapshot>({
    status: "ready", playheadSeconds: 0, currentTimelineIndex: initialIndex,
    pendingTimelineIndex: undefined, retryKey: 0, revisionReset: false,
  });
  const snapshotRef = useRef(snapshot);
  const readyScenes = useRef(new Set<number>());
  const failedScenes = useRef(new Set<number>());
  const resumeAfterBuffering = useRef(false);
  const completedThisPass = useRef(false);
  const revision = useRef(timeline.revision);

  const update = useCallback((change: (current: StoryPreviewSnapshot) => StoryPreviewSnapshot) => {
    setSnapshot((current) => {
      const changed = change(current);
      snapshotRef.current = changed;
      return changed;
    });
  }, []);

  useEffect(() => {
    if (revision.current === timeline.revision) return;
    revision.current = timeline.revision;
    readyScenes.current.clear();
    failedScenes.current.clear();
    resumeAfterBuffering.current = false;
    completedThisPass.current = false;
    update((current) => ({
      status: "ready", playheadSeconds: 0, currentTimelineIndex: firstPlayableTimelineIndex(timeline),
      pendingTimelineIndex: undefined, retryKey: current.retryKey + 1, revisionReset: true,
    }));
  }, [timeline, update]);

  useEffect(() => {
    if (snapshot.status !== "playing") return;
    let frame = 0;
    let previousNow = performance.now();
    const tick = (now: number) => {
      const elapsedSeconds = Math.max(0, (now - previousNow) / 1_000);
      previousNow = now;
      advance(elapsedSeconds);
      if (snapshotRef.current.status === "playing") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  // `advance` intentionally reads the latest snapshot from a ref; status starts and stops this clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.status, timeline, onCompleted]);

  useEffect(() => {
    const pauseForBackground = () => {
      if (snapshotRef.current.status === "playing" || snapshotRef.current.status === "buffering") pause();
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") pauseForBackground(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pauseForBackground);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pauseForBackground);
    };
  // Stable callbacks read refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance(elapsedSeconds: number) {
    const current = snapshotRef.current;
    if (current.status !== "playing" || current.currentTimelineIndex === undefined) return;
    const scene = timeline.scenes[current.currentTimelineIndex];
    if (!scene) return;
    const target = clampPlayhead(timeline, current.playheadSeconds + elapsedSeconds);
    if (target < scene.endSeconds) {
      update((value) => ({ ...value, playheadSeconds: target }));
      return;
    }

    const nextIndex = nextPlayableTimelineIndex(timeline, current.currentTimelineIndex);
    if (nextIndex === undefined) {
      update((value) => ({ ...value, status: "completed", playheadSeconds: timeline.totalDurationSeconds }));
      if (!completedThisPass.current) {
        completedThisPass.current = true;
        onCompleted();
      }
      return;
    }

    const boundary = timeline.scenes[nextIndex]!.startSeconds;
    if (failedScenes.current.has(nextIndex)) {
      resumeAfterBuffering.current = true;
      update((value) => ({ ...value, status: "failed", playheadSeconds: boundary, pendingTimelineIndex: nextIndex }));
      return;
    }
    if (!readyScenes.current.has(nextIndex)) {
      resumeAfterBuffering.current = true;
      update((value) => ({ ...value, status: "buffering", playheadSeconds: boundary, pendingTimelineIndex: nextIndex }));
      return;
    }
    update((value) => ({
      ...value, playheadSeconds: boundary, currentTimelineIndex: nextIndex, pendingTimelineIndex: undefined,
    }));
  }

  const play = useCallback(() => {
    const current = snapshotRef.current;
    if (current.currentTimelineIndex === undefined || timeline.totalDurationSeconds <= 0 || current.status === "failed") return;
    let playheadSeconds = current.playheadSeconds;
    let currentTimelineIndex = current.currentTimelineIndex;
    if (current.status === "completed") {
      playheadSeconds = 0;
      currentTimelineIndex = firstPlayableTimelineIndex(timeline)!;
      completedThisPass.current = false;
    }
    resumeAfterBuffering.current = true;
    const ready = readyScenes.current.has(currentTimelineIndex);
    update((value) => ({
      ...value, status: ready ? "playing" : "buffering", playheadSeconds, currentTimelineIndex,
      pendingTimelineIndex: ready ? undefined : currentTimelineIndex, revisionReset: false,
    }));
  }, [timeline, update]);

  const pause = useCallback(() => {
    const current = snapshotRef.current;
    if (current.status !== "playing" && current.status !== "buffering") return;
    resumeAfterBuffering.current = false;
    update((value) => ({ ...value, status: "paused", pendingTimelineIndex: undefined }));
  }, [update]);

  const stop = useCallback(() => {
    resumeAfterBuffering.current = false;
    completedThisPass.current = false;
    update((value) => ({
      ...value, status: "ready", playheadSeconds: 0, currentTimelineIndex: firstPlayableTimelineIndex(timeline),
      pendingTimelineIndex: undefined, revisionReset: false,
    }));
  }, [timeline, update]);

  const seek = useCallback((playheadSeconds: number) => {
    const current = snapshotRef.current;
    const playhead = clampPlayhead(timeline, playheadSeconds);
    const wasPlaying = current.status === "playing";
    const position = positionAtPlayhead(timeline, playhead);
    resumeAfterBuffering.current = wasPlaying;
    if (!position) return;
    if (playhead >= timeline.totalDurationSeconds) {
      update((value) => ({
        ...value, status: "completed", playheadSeconds: playhead,
        currentTimelineIndex: position.timelineIndex, pendingTimelineIndex: undefined, revisionReset: false,
      }));
      return;
    }
    const ready = readyScenes.current.has(position.timelineIndex);
    update((value) => ({
      ...value, status: ready ? wasPlaying ? "playing" : "paused" : "buffering", playheadSeconds: playhead,
      currentTimelineIndex: position.timelineIndex, pendingTimelineIndex: ready ? undefined : position.timelineIndex,
      revisionReset: false,
    }));
  }, [timeline, update]);

  const retry = useCallback(() => {
    const current = snapshotRef.current;
    const target = current.pendingTimelineIndex ?? current.currentTimelineIndex;
    if (target === undefined) return;
    failedScenes.current.delete(target);
    readyScenes.current.delete(target);
    update((value) => ({ ...value, status: "buffering", retryKey: value.retryKey + 1 }));
  }, [update]);

  const onSceneReady = useCallback((timelineIndex: number) => {
    readyScenes.current.add(timelineIndex);
    failedScenes.current.delete(timelineIndex);
    const current = snapshotRef.current;
    if (current.status !== "buffering" || current.pendingTimelineIndex !== timelineIndex) return;
    update((value) => ({
      ...value,
      status: resumeAfterBuffering.current ? "playing" : "paused",
      currentTimelineIndex: timelineIndex,
      pendingTimelineIndex: undefined,
    }));
  }, [update]);

  const onSceneWaiting = useCallback((timelineIndex: number) => {
    const current = snapshotRef.current;
    if (current.currentTimelineIndex !== timelineIndex || current.status !== "playing") return;
    resumeAfterBuffering.current = true;
    update((value) => ({ ...value, status: "buffering", pendingTimelineIndex: timelineIndex }));
  }, [update]);

  const onSceneFailed = useCallback((timelineIndex: number) => {
    failedScenes.current.add(timelineIndex);
    const current = snapshotRef.current;
    if (current.currentTimelineIndex !== timelineIndex && current.pendingTimelineIndex !== timelineIndex) return;
    if (current.status === "playing" || current.status === "buffering") resumeAfterBuffering.current = true;
    update((value) => ({ ...value, status: "failed", pendingTimelineIndex: timelineIndex }));
  }, [update]);

  const onUnexpectedPause = useCallback((timelineIndex: number) => {
    const current = snapshotRef.current;
    if (current.currentTimelineIndex !== timelineIndex || current.status !== "playing") return;
    resumeAfterBuffering.current = false;
    update((value) => ({ ...value, status: "paused", pendingTimelineIndex: undefined }));
  }, [update]);

  return { snapshot, play, pause, stop, seek, retry, onSceneReady, onSceneWaiting, onSceneFailed, onUnexpectedPause };
}
