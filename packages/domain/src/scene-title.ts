import { DomainError } from "./errors.js";
import {
  sceneTitleColors, sceneTitleSizes, sceneTitleStyles, type SceneTitle,
} from "./model.js";

export const sceneTitleMaximumCharacters = 120;
export const sceneTitleMaximumLines = 3;
export const sceneTitleMinimumDurationSeconds = 0.5;
export const sceneTitleFadeDurationSeconds = 0.15;
export const sceneTitleMaximumWidthRatio = 0.84;
export const sceneTitleSafeInsetRatio = 0.1;
export const sceneTitleRendererVersion = "scene-title.v2";
export const sceneTitleFontPixels = { small: 48, medium: 64, large: 84 } as const;

export function createDefaultSceneTitle(text: string, durationSeconds: number): SceneTitle {
  return normalizeSceneTitle({
    text,
    position: { x: 0.5, y: 0.78 },
    style: "shadow",
    size: "medium",
    color: "#FFFFFF",
    timing: { startSeconds: 0, endSeconds: durationSeconds },
  }, durationSeconds);
}

export function normalizeSceneTitle(title: SceneTitle, durationSeconds: number): SceneTitle {
  const text = normalizedText(title.text);
  validateSceneTitle({ ...title, text }, durationSeconds);
  return { ...title, text };
}

export function validateSceneTitle(title: SceneTitle, durationSeconds: number): void {
  const text = normalizedText(title.text);
  if (!text) throw new DomainError("scene title text is required");
  if ([...text].length > sceneTitleMaximumCharacters) {
    throw new DomainError(`scene title text must contain at most ${sceneTitleMaximumCharacters} characters`);
  }
  if (text.split("\n").length > sceneTitleMaximumLines) {
    throw new DomainError(`scene title text must contain at most ${sceneTitleMaximumLines} lines`);
  }
  if (![title.position.x, title.position.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new DomainError("scene title coordinates must be between 0 and 1");
  }
  if (!(sceneTitleStyles as readonly string[]).includes(title.style)) throw new DomainError("scene title style is invalid");
  if (!(sceneTitleSizes as readonly string[]).includes(title.size)) throw new DomainError("scene title size is invalid");
  if (!(sceneTitleColors as readonly string[]).includes(title.color)) throw new DomainError("scene title color is invalid");
  const { startSeconds, endSeconds } = title.timing;
  const minimum = Math.min(sceneTitleMinimumDurationSeconds, durationSeconds);
  if (![durationSeconds, startSeconds, endSeconds].every(Number.isFinite) || durationSeconds <= 0
    || startSeconds < 0 || endSeconds > durationSeconds + 1e-6 || endSeconds <= startSeconds
    || endSeconds - startSeconds + 1e-6 < minimum) {
    throw new DomainError("scene title timing must fit the scene and last at least 0.5 seconds");
  }
}

/** Preserve absolute seconds and move only the invalid tail when a scene becomes shorter. */
export function clampSceneTitleToDuration(title: SceneTitle, durationSeconds: number): SceneTitle | undefined {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  const minimum = Math.min(sceneTitleMinimumDurationSeconds, durationSeconds);
  let endSeconds = Math.min(durationSeconds, Math.max(minimum, title.timing.endSeconds));
  let startSeconds = Math.min(Math.max(0, title.timing.startSeconds), Math.max(0, endSeconds - minimum));
  if (endSeconds - startSeconds < minimum) {
    endSeconds = durationSeconds;
    startSeconds = Math.max(0, endSeconds - minimum);
  }
  return { ...title, timing: { startSeconds: rounded(startSeconds), endSeconds: rounded(endSeconds) } };
}

export function sceneTitleOpacity(title: SceneTitle, localTimeSeconds: number): number {
  const { startSeconds, endSeconds } = title.timing;
  if (localTimeSeconds < startSeconds || localTimeSeconds > endSeconds) return 0;
  const fade = Math.min(sceneTitleFadeDurationSeconds, (endSeconds - startSeconds) / 2);
  if (fade <= 0) return 1;
  return Math.max(0, Math.min(1, (localTimeSeconds - startSeconds) / fade, (endSeconds - localTimeSeconds) / fade));
}

function normalizedText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

function rounded(value: number): number { return Number(value.toFixed(6)); }
