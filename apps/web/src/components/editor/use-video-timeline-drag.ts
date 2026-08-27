import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { VideoTrim } from "../../api.js";
import { keyboardTimelineTime, timelineTime } from "./video-timeline-model.js";

export type TimelineTarget = "playhead" | keyof VideoTrim;
interface TimelineDragOptions {
  readonly duration: number;
  readonly range: VideoTrim;
  readonly currentTime: number;
  readonly disabled: boolean;
  readonly onSeek: (seconds: number) => void;
  readonly onBoundaryChange: (boundary: keyof VideoTrim, seconds: number) => void;
}

export function useVideoTimelineDrag({ duration, range, currentTime, disabled, onSeek, onBoundaryChange }: TimelineDragOptions) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; target: TimelineTarget; x: number; seconds: number; width: number } | undefined>(undefined);
  useEffect(() => { if (disabled) drag.current = undefined; }, [disabled]);

  function change(target: TimelineTarget, seconds: number) {
    if (target === "playhead") onSeek(Math.max(range.startSeconds, Math.min(range.endSeconds, seconds)));
    else onBoundaryChange(target, seconds);
  }

  function start(event: PointerEvent<HTMLElement>, target: TimelineTarget, jump = false) {
    if (disabled || event.button !== 0 || drag.current || !track.current || duration <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = track.current.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const seconds = target === "playhead" ? currentTime : range[target];
    const position = jump ? Math.max(range.startSeconds, Math.min(range.endSeconds, timelineTime(event.clientX, bounds.left, bounds.width, duration))) : seconds;
    drag.current = { pointerId: event.pointerId, target, x: event.clientX, seconds: position, width: bounds.width };
    track.current.setPointerCapture(event.pointerId);
    if (jump) track.current.querySelector<HTMLElement>('[data-playhead="true"]')?.focus({ preventScroll: true });
    else event.currentTarget.focus({ preventScroll: true });
    if (jump) change(target, position);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const active = drag.current;
    if (disabled || !active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    change(active.target, active.seconds + (event.clientX - active.x) / active.width * duration);
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (track.current?.hasPointerCapture(event.pointerId)) track.current.releasePointerCapture(event.pointerId);
  }

  function keyDown(event: KeyboardEvent<HTMLElement>, target: TimelineTarget) {
    if (disabled) return;
    const minimum = target === "startSeconds" ? 0 : range.startSeconds;
    const maximum = target === "endSeconds" ? duration : range.endSeconds;
    const value = target === "playhead" ? currentTime : range[target];
    const next = keyboardTimelineTime(event.key, value, minimum, maximum, event.shiftKey);
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    change(target, next);
  }

  return {
    track, start, keyDown,
    trackEvents: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => start(event, "playhead", true),
      onPointerMove: move, onPointerUp: end, onPointerCancel: end,
      onLostPointerCapture: () => { drag.current = undefined; },
    },
  };
}
