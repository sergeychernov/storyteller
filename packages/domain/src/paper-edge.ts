export const tornPaperEdgeSalts = { top: 17, right: 29, bottom: 37, left: 43 } as const;
export const tornPaperInnerEdgeSalts = { top: 53, right: 61, bottom: 71, left: 79 } as const;
export const tornPaperEdgeBaseSeed = 17_041;

export interface TornPaperEdgeParameters {
  readonly variation: number;
  readonly step: number;
}

/** Matches animated-collage's default: sparse 0–3 px offsets joined by straight fibers. */
export function tornPaperEdgeParameters(frameWidth: number): TornPaperEdgeParameters {
  const variation = Math.max(1, Math.min(3, Math.floor(frameWidth) - 1));
  return { variation, step: Math.max(5, variation * 3) };
}

/** A calmer inner fiber line that lets the paper overlap the photo without looking machine-cut. */
export function tornPaperInnerEdgeParameters(frameWidth: number): TornPaperEdgeParameters {
  const outer = tornPaperEdgeParameters(frameWidth);
  return {
    variation: Math.max(0.75, outer.variation * 0.6),
    step: Math.max(12, outer.step * 2),
  };
}

export function tornPaperEdgeSeed(cardIndex: number): number {
  return tornPaperEdgeBaseSeed + cardIndex;
}

export function createTornPaperClipPath(input: {
  readonly width: number;
  readonly height: number;
  readonly frameWidth: number;
  readonly seed: number;
}): string {
  return createPaperClipPath(input, tornPaperEdgeParameters(input.frameWidth), tornPaperEdgeSalts);
}

/**
 * An even-odd SVG path for the paper fibers that overlap the photo at the
 * frame's inner edge. The photo itself must remain uncut underneath this path.
 */
export function createTornPaperInnerFramePath(input: {
  readonly width: number;
  readonly height: number;
  readonly frameWidth: number;
  readonly seed: number;
}): string {
  const { width, height } = input;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return "";
  const points = createPaperPoints(
    input,
    tornPaperInnerEdgeParameters(input.frameWidth),
    tornPaperInnerEdgeSalts,
  );
  const hole = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${svgNumber(x)} ${svgNumber(y)}`).join("");
  return `M0 0H${svgNumber(width)}V${svgNumber(height)}H0Z${hole}Z`;
}

function createPaperClipPath(
  input: { readonly width: number; readonly height: number; readonly seed: number },
  parameters: TornPaperEdgeParameters,
  salts: Readonly<Record<"top" | "right" | "bottom" | "left", number>>,
): string {
  const { width, height } = input;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return "none";
  const points = createPaperPoints(input, parameters, salts);
  return `polygon(${points.map(([x, y]) => point(x / width, y / height)).join(",")})`;
}

function createPaperPoints(
  input: { readonly width: number; readonly height: number; readonly seed: number },
  parameters: TornPaperEdgeParameters,
  salts: Readonly<Record<"top" | "right" | "bottom" | "left", number>>,
): readonly (readonly [number, number])[] {
  const { width, height, seed } = input;
  const { variation, step } = parameters;
  const points: [number, number][] = [];
  for (const x of edgePositions(width, step)) {
    points.push([x, edgeOffset(x, step, variation, seed, salts.top)]);
  }
  for (const y of edgePositions(height, step)) {
    points.push([width - edgeOffset(y, step, variation, seed, salts.right), y]);
  }
  for (const x of edgePositions(width, step).reverse()) {
    points.push([x, height - edgeOffset(x, step, variation, seed, salts.bottom)]);
  }
  for (const y of edgePositions(height, step).reverse()) {
    points.push([edgeOffset(y, step, variation, seed, salts.left), y]);
  }
  return points;
}

function edgePositions(length: number, step: number): number[] {
  const positions = Array.from({ length: Math.floor(length / step) + 1 }, (_, index) => index * step);
  if (positions.at(-1) !== length) positions.push(length);
  return positions;
}

function edgeOffset(position: number, step: number, variation: number, seed: number, salt: number): number {
  const segment = Math.floor(position / step);
  const progress = position % step / step;
  const start = noise(segment, variation, seed, salt);
  const end = noise(segment + 1, variation, seed, salt);
  return start * (1 - progress) + end * progress;
}

function noise(segment: number, variation: number, seed: number, salt: number): number {
  const value = Math.abs(Math.sin((segment + seed * salt) * 12.9898 + salt * 78.233) * 43_758.5453);
  return (value - Math.floor(value)) * variation;
}

function point(x: number, y: number): string {
  return `${(x * 100).toFixed(4)}% ${(y * 100).toFixed(4)}%`;
}

function svgNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}
