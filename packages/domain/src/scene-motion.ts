import type { FocusPoint, SceneMaterial, SceneMotion } from "./model.js";

export const centeredFocusPoint: FocusPoint = { x: 0.5, y: 0.5 };
export const focusDwellStrength = 0.55;

const landscapeMotions = ["none", "pan-left", "pan-right"] as const satisfies readonly SceneMotion[];
const portraitMotions = ["none", "zoom-in", "zoom-out"] as const satisfies readonly SceneMotion[];

export function getSceneMotionOptions(materials: readonly SceneMaterial[]): readonly SceneMotion[] {
  const material = materials[0];
  if (!material || material.kind !== "image") return ["none"];
  return material.orientation === "landscape" ? landscapeMotions : portraitMotions;
}

export function defaultSingleImageMotion(material: SceneMaterial): SceneMotion {
  if (material.kind !== "image") return "none";
  return material.orientation === "landscape" ? "pan-right" : "zoom-in";
}

export function focusDwellProgress(progress: number, focusX: number): number {
  const time = clampUnit(progress);
  const focus = clampUnit(focusX);
  const fastSlope = 1 + focusDwellStrength;
  const slowSlope = 1 - focusDwellStrength;
  if (focus <= 0) return hermite(time, slowSlope, fastSlope);
  if (focus >= 1) return hermite(time, fastSlope, slowSlope);
  return time <= focus
    ? focus * hermite(time / focus, fastSlope, slowSlope)
    : focus + (1 - focus) * hermite((time - focus) / (1 - focus), slowSlope, fastSlope);
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hermite(progress: number, startSlope: number, endSlope: number): number {
  const squared = progress * progress;
  const cubed = squared * progress;
  return (cubed - 2 * squared + progress) * startSlope
    + (-2 * cubed + 3 * squared)
    + (cubed - squared) * endSlope;
}
