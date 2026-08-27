import { getMaterialPresentation, type MaterialOrientation, type SceneMaterial, type SceneMotion } from "./model.js";

const landscapeMotions = ["none", "pan-left", "pan-right"] as const satisfies readonly SceneMotion[];
const portraitMotions = ["none", "zoom-in", "zoom-out"] as const satisfies readonly SceneMotion[];

export function getSceneMotionOptions(materials: readonly SceneMaterial[]): readonly SceneMotion[] {
  const material = materials[0];
  if (!material || material.kind !== "image") return ["none"];
  return getSingleImageMotionOptions(getMaterialPresentation(material).orientation);
}

export function getSingleImageMotionOptions(orientation: MaterialOrientation): readonly SceneMotion[] {
  return orientation === "landscape" ? landscapeMotions : portraitMotions;
}

export function defaultSingleImageMotion(material: SceneMaterial): SceneMotion {
  if (material.kind !== "image") return "none";
  return getMaterialPresentation(material).orientation === "landscape" ? "pan-right" : "zoom-in";
}
