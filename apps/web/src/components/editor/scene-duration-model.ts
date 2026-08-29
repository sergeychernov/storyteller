import type { Scene } from "../../api.js";
import { getSceneDurationSeconds } from "@storyteller/domain";
export { getSceneDurationSeconds } from "@storyteller/domain";

export function formatSceneDuration(scene: Scene): string {
  const duration = getSceneDurationSeconds(scene);
  return duration === undefined ? "—" : String(Number(duration.toFixed(2)));
}
