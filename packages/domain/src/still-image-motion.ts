import type { FocusPoint, MaterialOrientation, SceneMotion } from "./model.js";
import { getSingleImageMotionOptions } from "./scene-motion.js";

export const centeredFocusPoint: FocusPoint = { x: 0.5, y: 0.5 };
export const focusDwellStrength = 0.55;
export const stillImageZoomAmount = 0.13;
export const verticalStoryFrame: StillImageSize = { width: 9, height: 16 };

export interface StillImageSize {
  readonly width: number;
  readonly height: number;
}

export interface StillImageGeometry {
  readonly width: number;
  readonly height: number;
}

export interface StillImageAxisCrop {
  readonly progress: number;
  readonly focusPosition: number;
}

export interface StillImageBaseCrop {
  readonly x: StillImageAxisCrop;
  readonly y: StillImageAxisCrop;
}

export interface FocusDwellEasing {
  readonly kind: "focus-dwell";
  readonly at: number;
  readonly fastSlope: number;
  readonly slowSlope: number;
}

export interface CosineEasing {
  readonly kind: "cosine";
}

export type StillImageEasing = FocusDwellEasing | CosineEasing;

interface StillImageMotionPlanBase {
  readonly geometry: StillImageGeometry;
  readonly focusPoint: FocusPoint;
  readonly baseCrop: StillImageBaseCrop;
}

export interface StillImageStaticPlan extends StillImageMotionPlanBase {
  readonly kind: "static";
  readonly motion: "none";
}

export interface StillImagePanPlan extends StillImageMotionPlanBase {
  readonly kind: "pan";
  readonly motion: "pan-left" | "pan-right";
  readonly fromCropProgress: 0 | 1;
  readonly toCropProgress: 0 | 1;
  readonly easing: FocusDwellEasing;
}

export interface StillImageZoomPlan extends StillImageMotionPlanBase {
  readonly kind: "zoom";
  readonly motion: "zoom-in" | "zoom-out";
  readonly fromScale: number;
  readonly toScale: number;
  readonly easing: CosineEasing;
}

export type StillImageMotionPlan = StillImageStaticPlan | StillImagePanPlan | StillImageZoomPlan;

export interface StillImageMotionPlanInput {
  readonly sourceSize: StillImageSize;
  readonly frameSize: StillImageSize;
  readonly orientation: MaterialOrientation;
  readonly motion: SceneMotion;
  readonly focusPoint: FocusPoint;
}

export interface StillImageCameraFrame {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
}

export function createStillImageMotionPlan(input: StillImageMotionPlanInput): StillImageMotionPlan {
  if (!getSingleImageMotionOptions(input.orientation).includes(input.motion)) {
    throw new Error(`motion ${input.motion} is not valid for a ${input.orientation} image`);
  }
  const geometry = getStillImageCoverGeometry(input.sourceSize, input.frameSize);
  const focusPoint = { x: clampUnit(input.focusPoint.x), y: clampUnit(input.focusPoint.y) };
  const baseCrop = {
    x: createAxisCrop(geometry.width, focusPoint.x),
    y: createAxisCrop(geometry.height, focusPoint.y),
  };
  if (input.motion === "pan-left" || input.motion === "pan-right") {
    const forward = input.motion === "pan-right";
    const dwellAt = forward ? baseCrop.x.progress : 1 - baseCrop.x.progress;
    return {
      kind: "pan",
      motion: input.motion,
      geometry,
      focusPoint,
      baseCrop,
      fromCropProgress: forward ? 0 : 1,
      toCropProgress: forward ? 1 : 0,
      easing: createFocusDwellEasing(dwellAt),
    };
  }
  if (input.motion === "zoom-in" || input.motion === "zoom-out") {
    const zoomedScale = 1 + stillImageZoomAmount;
    return {
      kind: "zoom",
      motion: input.motion,
      geometry,
      focusPoint,
      baseCrop,
      fromScale: input.motion === "zoom-in" ? 1 : zoomedScale,
      toScale: input.motion === "zoom-in" ? zoomedScale : 1,
      easing: { kind: "cosine" },
    };
  }
  return { kind: "static", motion: "none", geometry, focusPoint, baseCrop };
}

export function evaluateStillImageMotion(plan: StillImageMotionPlan, progress: number): StillImageCameraFrame {
  if (plan.kind === "pan") {
    const travelProgress = evaluateStillImageEasing(plan.easing, progress);
    const cropProgress = interpolate(plan.fromCropProgress, plan.toCropProgress, travelProgress);
    return {
      offsetX: -(plan.geometry.width - 1) * cropProgress,
      offsetY: (1 - plan.geometry.height) / 2,
      scale: 1,
    };
  }
  if (plan.kind === "zoom") {
    const eased = evaluateStillImageEasing(plan.easing, progress);
    return transformAroundFocus(plan.geometry, interpolate(plan.fromScale, plan.toScale, eased), plan.focusPoint);
  }
  return transformAroundFocus(plan.geometry, 1, plan.focusPoint);
}

export function getStillImageCoverGeometry(sourceSize: StillImageSize, frameSize: StillImageSize): StillImageGeometry {
  assertPositiveSize(sourceSize, "source");
  assertPositiveSize(frameSize, "frame");
  const sourceAspect = sourceSize.width / sourceSize.height;
  const frameAspect = frameSize.width / frameSize.height;
  return sourceAspect >= frameAspect
    ? { width: sourceAspect / frameAspect, height: 1 }
    : { width: 1, height: frameAspect / sourceAspect };
}

export function getAxisFocusProgress(contentSize: number, focus: number): number {
  const overflow = contentSize - 1;
  if (overflow <= 0) return 0.5;
  return clampUnit((contentSize * clampUnit(focus) - 0.5) / overflow);
}

export function focusDwellProgress(progress: number, dwellAt: number, strength = focusDwellStrength): number {
  return evaluateStillImageEasing(createFocusDwellEasing(dwellAt, strength), progress);
}

export function evaluateStillImageEasing(easing: StillImageEasing, progress: number): number {
  const time = clampUnit(progress);
  if (easing.kind === "cosine") return (1 - Math.cos(Math.PI * time)) / 2;
  const focus = easing.at;
  const { fastSlope, slowSlope } = easing;
  if (focus <= 0) return hermite(time, slowSlope, fastSlope);
  if (focus >= 1) return hermite(time, fastSlope, slowSlope);
  return time <= focus
    ? focus * hermite(time / focus, fastSlope, slowSlope)
    : focus + (1 - focus) * hermite((time - focus) / (1 - focus), slowSlope, fastSlope);
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function transformAroundFocus(geometry: StillImageGeometry, scale: number, focusPoint: FocusPoint): StillImageCameraFrame {
  const scaledWidth = geometry.width * scale;
  const scaledHeight = geometry.height * scale;
  return {
    offsetX: clamp(0.5 - focusPoint.x * scaledWidth, 1 - scaledWidth, 0),
    offsetY: clamp(0.5 - focusPoint.y * scaledHeight, 1 - scaledHeight, 0),
    scale,
  };
}

function createFocusDwellEasing(at: number, strength = focusDwellStrength): FocusDwellEasing {
  const normalizedStrength = clampUnit(strength);
  return {
    kind: "focus-dwell",
    at: clampUnit(at),
    fastSlope: 1 + normalizedStrength,
    slowSlope: 1 - normalizedStrength,
  };
}

function createAxisCrop(contentSize: number, focus: number): StillImageAxisCrop {
  const progress = getAxisFocusProgress(contentSize, focus);
  return {
    progress,
    focusPosition: clampUnit(contentSize * focus - (contentSize - 1) * progress),
  };
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function hermite(progress: number, startSlope: number, endSlope: number): number {
  const squared = progress * progress;
  const cubed = squared * progress;
  return (cubed - 2 * squared + progress) * startSlope
    + (-2 * cubed + 3 * squared)
    + (cubed - squared) * endSlope;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertPositiveSize(size: StillImageSize, label: string): void {
  if (![size.width, size.height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error(`${label} width and height must be positive`);
  }
}
