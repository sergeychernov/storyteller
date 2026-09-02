import { useEffect, useLayoutEffect, useRef, type RefObject, type SyntheticEvent } from "react";
import type { VideoMaterial } from "../../api.js";
import { createSceneMediaLifecycle, type SceneMediaLifecycle } from "./scene-media-lifecycle.js";
import {
  isSceneMediaAtSourceEnd, sceneMediaSourceTime, shouldSceneMediaReportWaiting,
} from "./scene-media-time.js";
import type { SceneResourceEvent } from "./scene-resource-model.js";

interface SceneMediaTrackOptions {
  readonly sourceKey: string | undefined;
  readonly enabled: boolean;
  readonly material: VideoMaterial;
  readonly loop: boolean;
  readonly localTimeSeconds: number;
  readonly shouldPlay: boolean;
  readonly active: boolean;
  readonly playbackEnded: boolean;
  readonly reportWaiting: boolean;
  readonly resourceId: string;
  readonly onResourceState: (event: SceneResourceEvent) => void;
  readonly onUnexpectedPause: () => void;
}

interface ClockSample {
  readonly localTimeSeconds: number;
  readonly nowMilliseconds: number;
  readonly playing: boolean;
  readonly sourceKey: string | undefined;
}

export interface SceneMediaTrack<T extends HTMLMediaElement> {
  readonly mediaRef: RefObject<T | null>;
  readonly playFromGesture: (localTimeSeconds: number) => void;
  readonly events: {
    readonly onLoadedMetadata: () => void;
    readonly onCanPlay: () => void;
    readonly onPlaying: () => void;
    readonly onWaiting: (event: SyntheticEvent<T>) => void;
    readonly onStalled: (event: SyntheticEvent<T>) => void;
    readonly onError: () => void;
    readonly onPause: () => void;
  };
}

/** Owns one native media track; native playback stays smooth between controlled playhead jumps. */
export function useSceneMediaTrack<T extends HTMLMediaElement>(options: SceneMediaTrackOptions): SceneMediaTrack<T> {
  const mediaRef = useRef<T>(null);
  const lifecycle = useRef<SceneMediaLifecycle>(null);
  const localTime = useRef(options.localTimeSeconds);
  const report = useRef(options.onResourceState);
  const unexpectedPause = useRef(options.onUnexpectedPause);
  const programmaticPause = useRef(false);
  const observedPlaying = useRef(false);
  const disposing = useRef(false);
  const clockSample = useRef<ClockSample | undefined>(undefined);
  localTime.current = options.localTimeSeconds;
  report.current = options.onResourceState;
  unexpectedPause.current = options.onUnexpectedPause;

  const trimStart = options.material.edit?.trim?.startSeconds;
  const trimEnd = options.material.edit?.trim?.endSeconds;
  useLayoutEffect(() => {
    const element = mediaRef.current;
    if (!options.enabled || !element) return;
    disposing.current = false;
    observedPlaying.current = false;
    clockSample.current = undefined;
    const controller = createSceneMediaLifecycle(
      element,
      (seconds) => sceneMediaSourceTime(options.material, seconds, options.loop),
    );
    lifecycle.current = controller;
    return () => {
      disposing.current = true;
      programmaticPause.current = true;
      observedPlaying.current = false;
      clockSample.current = undefined;
      controller.dispose();
      if (lifecycle.current === controller) lifecycle.current = null;
    };
  }, [options.enabled, options.loop, options.material.sourceDurationSeconds, options.sourceKey, trimEnd, trimStart]);

  useEffect(() => {
    const controller = lifecycle.current;
    if (!controller) return;
    if (options.shouldPlay) void controller.play(localTime.current).catch(() => fail());
    else {
      observedPlaying.current = false;
      if (mediaRef.current && !mediaRef.current.paused) programmaticPause.current = true;
      controller.pause();
      controller.seek(localTime.current);
    }
  }, [options.enabled, options.shouldPlay, options.sourceKey]);

  useEffect(() => {
    const nowMilliseconds = performance.now();
    const previous = clockSample.current;
    clockSample.current = {
      localTimeSeconds: options.localTimeSeconds,
      nowMilliseconds,
      playing: options.shouldPlay,
      sourceKey: options.sourceKey,
    };
    if (!followsNativeClock(previous, clockSample.current)) lifecycle.current?.seek(options.localTimeSeconds);
  }, [options.localTimeSeconds, options.shouldPlay, options.sourceKey]);

  const ready = () => report.current({ resourceId: options.resourceId, state: "ready" });
  const fail = () => report.current({ resourceId: options.resourceId, state: "failed" });
  const wait = (event: SyntheticEvent<T>) => {
    if (options.reportWaiting && shouldSceneMediaReportWaiting(
      options.active, options.playbackEnded, options.material, event.currentTarget,
    )) report.current({ resourceId: options.resourceId, state: "waiting" });
  };

  return {
    mediaRef,
    playFromGesture(seconds) {
      void lifecycle.current?.play(seconds).catch(() => fail());
    },
    events: {
      onLoadedMetadata() {
        void lifecycle.current?.prepare(localTime.current).then(ready).catch(fail);
      },
      onCanPlay: ready,
      onPlaying() {
        observedPlaying.current = true;
        ready();
      },
      onWaiting: wait,
      onStalled: wait,
      onError: fail,
      onPause() {
        const wasPlaying = observedPlaying.current;
        observedPlaying.current = false;
        if (programmaticPause.current || disposing.current) programmaticPause.current = false;
        else if (options.shouldPlay && wasPlaying && !isSceneMediaAtSourceEnd(
          options.material, mediaRef.current?.currentTime,
        )) unexpectedPause.current();
      },
    },
  };
}

/** Normal rAF progress follows the native clock; scrubbing, wraparound and state changes seek explicitly. */
function followsNativeClock(previous: ClockSample | undefined, current: ClockSample): boolean {
  if (!previous?.playing || !current.playing || previous.sourceKey !== current.sourceKey) return false;
  const playheadElapsed = current.localTimeSeconds - previous.localTimeSeconds;
  const wallElapsed = Math.max(0, (current.nowMilliseconds - previous.nowMilliseconds) / 1_000);
  return playheadElapsed >= 0 && Math.abs(playheadElapsed - wallElapsed) <= 0.12;
}
