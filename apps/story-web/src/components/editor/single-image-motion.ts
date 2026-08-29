import { evaluateStillImageMotion } from "@storyteller/domain";
import type { StillImageMotionPlan } from "@storyteller/domain";

export interface MotionFrame {
  readonly offset: number;
  readonly transform: string;
}

export function buildSingleImageMotionFrames(
  plan: StillImageMotionPlan,
  sampleCount = 60,
): readonly MotionFrame[] {
  if (plan.kind === "static") return [{ offset: 0, transform: transformForPreview(plan, 0) }];
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const progress = index / sampleCount;
    return { offset: progress, transform: transformForPreview(plan, progress) };
  });
}

function transformForPreview(plan: StillImageMotionPlan, progress: number): string {
  const frame = evaluateStillImageMotion(plan, progress);
  const translateX = frame.offsetX / plan.geometry.width * 100;
  const translateY = frame.offsetY / plan.geometry.height * 100;
  return `translate(${translateX.toFixed(4)}%, ${translateY.toFixed(4)}%) scale(${frame.scale.toFixed(5)})`;
}
