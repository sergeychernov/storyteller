import type { Scene } from "../../api.js";

export function getSceneDurationSeconds(scene: Scene): number | undefined {
  const material = scene.materials[0];
  // Configured scene duration controls photos/layouts, not the selected video range.
  if (scene.materials.length !== 1 || material?.kind !== "video") return scene.durationSeconds;
  const trim = material.edit?.trim;
  return trim ? trim.endSeconds - trim.startSeconds : material.sourceDurationSeconds ?? material.videoTrack?.durationSeconds;
}

export function formatSceneDuration(scene: Scene): string {
  const duration = getSceneDurationSeconds(scene);
  return duration === undefined ? "—" : String(Number(duration.toFixed(2)));
}
