export interface RationalFrameRate {
  readonly numerator: number;
  readonly denominator: number;
}

export const defaultStoryFrameRate: RationalFrameRate = { numerator: 30, denominator: 1 };

export function normalizeFrameRate(value: RationalFrameRate | undefined): RationalFrameRate {
  if (!value || !Number.isInteger(value.numerator) || !Number.isInteger(value.denominator)
    || value.numerator <= 0 || value.denominator <= 0) return defaultStoryFrameRate;
  const divisor = greatestCommonDivisor(value.numerator, value.denominator);
  const normalized = { numerator: value.numerator / divisor, denominator: value.denominator / divisor };
  const fps = frameRateValue(normalized);
  return fps >= 23 && fps <= 60 ? normalized : defaultStoryFrameRate;
}

export function parseFrameRate(value: unknown): RationalFrameRate | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) return undefined;
  const normalized = normalizeFrameRate({ numerator, denominator });
  return frameRateValue({ numerator, denominator }) >= 23 && frameRateValue({ numerator, denominator }) <= 60
    ? normalized : undefined;
}

export function frameRateValue(frameRate: RationalFrameRate): number {
  return frameRate.numerator / frameRate.denominator;
}

export function frameRateExpression(frameRate: RationalFrameRate): string {
  return `${frameRate.numerator}/${frameRate.denominator}`;
}

export function secondsToFrames(seconds: number, frameRate: RationalFrameRate): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds * frameRate.numerator / frameRate.denominator));
}

export function framesToSeconds(frames: number, frameRate: RationalFrameRate): number {
  return frames * frameRate.denominator / frameRate.numerator;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
