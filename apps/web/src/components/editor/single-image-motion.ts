import { clampUnit, focusDwellProgress } from "@storyteller/domain";
import type { FocusPoint, SceneMotion } from "../../api.js";

export interface CoverGeometry {
  readonly width: number;
  readonly height: number;
}

export interface MotionFrame {
  readonly offset: number;
  readonly transform: string;
}

const zoomAmount = 0.13;

export function getCoverGeometry(sourceWidth: number, sourceHeight: number): CoverGeometry {
  const sourceAspect = sourceWidth / sourceHeight;
  const frameAspect = 9 / 16;
  return sourceAspect >= frameAspect
    ? { width: sourceAspect / frameAspect, height: 1 }
    : { width: 1, height: frameAspect / sourceAspect };
}

export function buildSingleImageMotionFrames(
  geometry: CoverGeometry,
  motion: SceneMotion,
  focusPoint: FocusPoint,
  sampleCount = 60,
): readonly MotionFrame[] {
  if (motion === "none") return [{ offset: 0, transform: transformFor(geometry, 1, focusPoint) }];
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const progress = index / sampleCount;
    if (motion === "pan-left" || motion === "pan-right") {
      const curved = focusDwellProgress(progress, focusPoint.x);
      const cameraProgress = motion === "pan-right" ? curved : 1 - curved;
      const x = -(geometry.width - 1) * cameraProgress;
      const y = (1 - geometry.height) / 2;
      return { offset: progress, transform: transformFromOffset(geometry, x, y, 1) };
    }
    const eased = (1 - Math.cos(Math.PI * progress)) / 2;
    const zoom = motion === "zoom-in" ? 1 + zoomAmount * eased : 1 + zoomAmount * (1 - eased);
    return { offset: progress, transform: transformFor(geometry, zoom, focusPoint) };
  });
}

function transformFor(geometry: CoverGeometry, zoom: number, focusPoint: FocusPoint): string {
  const scaledWidth = geometry.width * zoom;
  const scaledHeight = geometry.height * zoom;
  const x = clamp(0.5 - clampUnit(focusPoint.x) * scaledWidth, 1 - scaledWidth, 0);
  const y = clamp(0.5 - clampUnit(focusPoint.y) * scaledHeight, 1 - scaledHeight, 0);
  return transformFromOffset(geometry, x, y, zoom);
}

function transformFromOffset(geometry: CoverGeometry, x: number, y: number, zoom: number): string {
  const translateX = x / geometry.width * 100;
  const translateY = y / geometry.height * 100;
  return `translate(${translateX.toFixed(4)}%, ${translateY.toFixed(4)}%) scale(${zoom.toFixed(5)})`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
