import { createStillImageMotionPlan } from "@storyteller/domain";
import type {
  FocusPoint, MaterialOrientation, SceneMotion, StillImageEasing, StillImagePanPlan, StillImageSize, StillImageZoomPlan,
} from "@storyteller/domain";
import { probeMedia, type MediaProcessRunner, SpawnMediaProcessRunner } from "./ffmpeg.js";

export const stillImageRendererVersion = 1;

export interface StillImageRenderSpec {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly sourceSize: StillImageSize;
  readonly orientation: MaterialOrientation;
  readonly durationSeconds: number;
  readonly motion: SceneMotion;
  readonly focusPoint?: FocusPoint;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly overwrite?: boolean;
}

export function buildStillImageFilter(spec: StillImageRenderSpec): string {
  const normalized = normalizeSpec(spec);
  const { width, height, fps, durationSeconds, focusPoint, motion } = normalized;
  const motionPlan = createStillImageMotionPlan({
    sourceSize: normalized.sourceSize,
    frameSize: { width, height },
    orientation: normalized.orientation,
    motion,
    focusPoint,
  });
  const zooming = motionPlan.kind === "zoom";
  const canvasWidth = zooming ? width * 2 : width;
  const canvasHeight = zooming ? height * 2 : height;
  const cropX = motionPlan.kind === "pan"
    ? panCropX(motionPlan, durationSeconds)
    : axisCrop("iw", "ow", motionPlan.baseCrop.x.progress);
  const cropY = axisCrop("ih", "oh", motionPlan.baseCrop.y.progress);
  let filter = `[0:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,`
    + `crop=${canvasWidth}:${canvasHeight}:x=${cropX}:y=${cropY},setsar=1,fps=${fps},`
    + `trim=duration=${durationSeconds.toFixed(3)},setpts=PTS-STARTPTS`;
  if (motionPlan.kind === "zoom") filter += zoomPan(normalized, motionPlan);
  return `${filter},scale=in_range=full:out_range=tv,format=yuv420p[v0]`;
}

export async function renderStillImage(
  spec: StillImageRenderSpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<unknown> {
  const normalized = normalizeSpec(spec);
  const result = await runner.run("ffmpeg", [
    normalized.overwrite ? "-y" : "-n", "-v", "error", "-filter_threads", "2", "-filter_complex_threads", "2",
    "-loop", "1", "-t", normalized.durationSeconds.toFixed(3),
    "-i", normalized.sourcePath, "-filter_complex", buildStillImageFilter(normalized), "-map", "[v0]", "-an",
    "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(normalized.fps),
    "-movflags", "+faststart", normalized.outputPath,
  ]);
  if (result.exitCode !== 0) {
    const termination = result.signal ? `signal ${result.signal}` : `exit ${result.exitCode}`;
    throw new Error(`ffmpeg failed (${termination}): ${result.stderr.trim()}`);
  }
  return probeMedia(normalized.outputPath, runner);
}

function normalizeSpec(spec: StillImageRenderSpec): Required<StillImageRenderSpec> {
  const width = spec.width ?? 1080;
  const height = spec.height ?? 1920;
  const fps = spec.fps ?? 30;
  const overwrite = spec.overwrite ?? false;
  const focusPoint = spec.focusPoint ?? { x: 0.5, y: 0.5 };
  if (![width, height, fps, spec.durationSeconds, spec.sourceSize.width, spec.sourceSize.height]
    .every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("source size, output size, fps and duration must be positive");
  }
  if (![focusPoint.x, focusPoint.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("focus point coordinates must be between 0 and 1");
  }
  return { ...spec, width, height, fps, focusPoint, overwrite };
}

function panCropX(plan: StillImagePanPlan, durationSeconds: number): string {
  const progress = easingExpression(plan.easing, `t/${durationSeconds.toFixed(3)}`);
  const crop = interpolateExpression(plan.fromCropProgress, plan.toCropProgress, progress);
  return `(iw-ow)*clip(${crop}\\,0\\,1)`;
}

function zoomPan(spec: Required<StillImageRenderSpec>, plan: StillImageZoomPlan): string {
  const frames = Math.max(1, Math.round(spec.durationSeconds * spec.fps) - 1);
  const ease = easingExpression(plan.easing, `on/${frames}`);
  const zoom = interpolateExpression(plan.fromScale, plan.toScale, ease);
  const focusX = plan.baseCrop.x.focusPosition;
  const focusY = plan.baseCrop.y.focusPosition;
  const x = `max(0,min(iw-iw/zoom,iw*${focusX.toFixed(6)}-iw/(2*zoom)))`;
  const y = `max(0,min(ih-ih/zoom,ih*${focusY.toFixed(6)}-ih/(2*zoom)))`;
  return `,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${spec.width}x${spec.height}:fps=${spec.fps}`;
}

function axisCrop(input: "iw" | "ih", output: "ow" | "oh", progress: number): string {
  return `(${input}-${output})*${progress.toFixed(6)}`;
}

function interpolateExpression(from: number, to: number, progress: string): string {
  const distance = to - from;
  const operator = distance < 0 ? "-" : "+";
  return `${from.toFixed(3)}${operator}${Math.abs(distance).toFixed(3)}*${progress}`;
}

function easingExpression(easing: StillImageEasing, progress: string): string {
  if (easing.kind === "cosine") return `((1-cos(PI*min(${progress}\\,1)))/2)`;
  const at = easing.at.toFixed(6);
  const fastSlope = easing.fastSlope.toFixed(3);
  const slowSlope = easing.slowSlope.toFixed(3);
  if (easing.at <= 0) return hermiteExpression(progress, slowSlope, fastSlope);
  if (easing.at >= 1) return hermiteExpression(progress, fastSlope, slowSlope);
  const leftTime = `(${progress}/${at})`;
  const rightTime = `((${progress}-${at})/(1-${at}))`;
  const left = `${at}*${hermiteExpression(leftTime, fastSlope, slowSlope)}`;
  const right = `${at}+(1-${at})*${hermiteExpression(rightTime, slowSlope, fastSlope)}`;
  return `if(lte(${progress}\\,${at})\\,${left}\\,${right})`;
}

function hermiteExpression(progress: string, startSlope: string, endSlope: string): string {
  const squared = `(${progress})*(${progress})`;
  const cubed = `${squared}*(${progress})`;
  return `((${cubed}-2*${squared}+(${progress}))*${startSlope}`
    + `+(-2*${cubed}+3*${squared})+(${cubed}-${squared})*${endSlope})`;
}
