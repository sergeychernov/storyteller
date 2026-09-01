import { useEffect, useRef, useState } from "react";
import type { VideoTrim } from "../../api.js";
import { clampPlayheadToTrim } from "./video-timeline-model.js";

let currentPlayback: HTMLVideoElement | undefined;

interface VideoTrimPreviewOptions {
  readonly url: string | undefined;
  readonly sourceDurationSeconds: number;
  readonly trim: VideoTrim | undefined;
  readonly disabled: boolean;
  readonly loop?: boolean;
  readonly autoPlay?: boolean;
  /** Editors use one active preview; collage cards deliberately play in parallel. */
  readonly exclusivePlayback?: boolean;
}

export function useVideoTrimPreview({
  url, sourceDurationSeconds, trim, disabled, loop = false, autoPlay = false, exclusivePlayback = true,
}: VideoTrimPreviewOptions) {
  const video = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const duration = sourceDurationSeconds;
  const startSeconds = trim?.startSeconds ?? 0;
  const endSeconds = trim?.endSeconds ?? duration;

  useEffect(() => {
    const element = video.current;
    setFailed(Boolean(element?.error));
    setCurrentTime(element?.currentTime ?? 0);
    setPlaying(element ? !element.paused : false);
    if (exclusivePlayback && url && !autoPlay && currentPlayback !== element) currentPlayback?.pause();
    return () => {
      element?.pause();
      if (currentPlayback === element) currentPlayback = undefined;
    };
  }, [url, autoPlay, exclusivePlayback]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (disabled) element.pause();
    if (element.readyState > 0) {
      const position = clampPlayheadToTrim(element.currentTime, { startSeconds, endSeconds });
      if (position !== element.currentTime) seek(position);
    }
  }, [disabled, startSeconds, endSeconds]);

  useEffect(() => {
    const element = video.current;
    if (element && url && autoPlay && !disabled) void element.play().catch(() => undefined);
  }, [url, autoPlay, disabled]);

  useEffect(() => {
    const element = video.current;
    if (!element || !playing || endSeconds <= 0) return;
    let frame: number;
    // timeupdate can arrive only a few times a second; stop near the selected frame instead.
    function checkEnd() {
      if (element!.currentTime >= endSeconds) {
        if (!loop) { seek(endSeconds); return; }
        element!.currentTime = startSeconds;
      }
      setCurrentTime(element!.currentTime);
      frame = requestAnimationFrame(checkEnd);
    }
    frame = requestAnimationFrame(checkEnd);
    return () => cancelAnimationFrame(frame);
  }, [playing, startSeconds, endSeconds, loop]);

  function seek(seconds: number) {
    const element = video.current;
    if (!element || element.readyState === 0 || !Number.isFinite(seconds)) return;
    element.pause();
    // Seek just before EOF so the last frame is visible while adjusting the end handle.
    element.currentTime = Math.max(0, Math.min(seconds, element.duration - 0.001));
    setCurrentTime(element.currentTime);
  }

  function loadedMetadata() {
    const element = video.current;
    if (!element) return;
    seek(startSeconds);
    if (autoPlay && !disabled) void element.play().catch(() => undefined);
  }

  function timeUpdated() {
    const element = video.current;
    if (!element) return;
    if (!element.paused && endSeconds > 0 && element.currentTime >= endSeconds) {
      if (loop) element.currentTime = startSeconds;
      else seek(endSeconds);
    }
    setCurrentTime(element.currentTime);
  }

  function togglePlayback() {
    const element = video.current;
    if (!element || disabled || !url) return;
    if (!element.paused) element.pause();
    else {
      if (element.currentTime < startSeconds || element.currentTime >= endSeconds - 0.01) element.currentTime = startSeconds;
      void element.play().catch(() => setFailed(true));
    }
  }

  return {
    video, duration, currentTime, playing, failed, seek, togglePlayback,
    mediaEvents: {
      onLoadedMetadata: loadedMetadata,
      onTimeUpdate: timeUpdated,
      onPlay: () => {
        if (exclusivePlayback) {
          if (currentPlayback !== video.current) currentPlayback?.pause();
          currentPlayback = video.current ?? undefined;
        }
        setPlaying(true);
      },
      onPause: () => setPlaying(false),
      onError: () => setFailed(true),
      onEnded: () => {
        const element = video.current;
        if (element && loop && !disabled) {
          element.currentTime = startSeconds;
          void element.play().catch(() => undefined);
        }
      },
    },
  };
}
