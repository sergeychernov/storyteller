import type { VideoTrim } from "../../api.js";

export function clampPlayheadToTrim(seconds: number, range: VideoTrim): number {
  return Math.max(range.startSeconds, Math.min(range.endSeconds, seconds));
}

export function timelineRatio(seconds: number, duration: number): number {
  return duration > 0 && Number.isFinite(seconds) ? Math.max(0, Math.min(1, seconds / duration)) : 0;
}

export function timelineTime(clientX: number, left: number, width: number, duration: number): number {
  return width > 0 ? timelineRatio(clientX - left, width) * duration : 0;
}

export function keyboardTimelineTime(key: string, value: number, minimum: number, maximum: number, shift: boolean): number | undefined {
  const step = shift ? 0.1 : 0.01;
  const next = key === "Home" ? minimum : key === "End" ? maximum
    : key === "ArrowLeft" || key === "ArrowDown" ? value - step
      : key === "ArrowRight" || key === "ArrowUp" ? value + step : undefined;
  return next === undefined ? undefined : Math.max(minimum, Math.min(maximum, Math.round(next * 1_000) / 1_000));
}

export function waveformPath(peaks: readonly number[]): string {
  if (peaks.length === 0) return "";
  const points = peaks.map((value, index) => ({
    x: (index + 0.5) / peaks.length * 1_024,
    height: (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0) * 27,
  }));
  return `M0 32 ${points.map(({ x, height }) => `L${x.toFixed(2)} ${(32 - height).toFixed(2)}`).join(" ")} L1024 32 `
    + points.reverse().map(({ x, height }) => `L${x.toFixed(2)} ${(32 + height).toFixed(2)}`).join(" ") + " Z";
}

export function formatVideoTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6_000);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}
