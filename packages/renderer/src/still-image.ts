import type { FocusPoint, MaterialOrientation, SceneMotion } from "@storyteller/domain";
import { focusDwellStrength } from "@storyteller/domain";
import { probeMedia, type MediaProcessRunner, SpawnMediaProcessRunner } from "./ffmpeg.js";

const zoomAmount = 0.13;

export interface StillImageRenderSpec {
  readonly sourcePath: string;
  readonly outputPath: string;
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
  const zooming = motion === "zoom-in" || motion === "zoom-out";
  const canvasWidth = zooming ? width * 2 : width;
  const canvasHeight = zooming ? height * 2 : height;
  const cropX = motion === "pan-left" || motion === "pan-right"
    ? panCropX(motion, durationSeconds, focusPoint.x)
    : `(iw-ow)*${focusPoint.x.toFixed(3)}`;
  let filter = `[0:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,`
    + `crop=${canvasWidth}:${canvasHeight}:x=${cropX}:y=(ih-oh)/2,setsar=1,fps=${fps},`
    + `trim=duration=${durationSeconds.toFixed(3)},setpts=PTS-STARTPTS`;
  if (zooming) filter += zoomPan(normalized);
  return `${filter},scale=in_range=full:out_range=tv,format=yuv420p[v0]`;
}

export async function renderStillImage(
  spec: StillImageRenderSpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<unknown> {
  const normalized = normalizeSpec(spec);
  const result = await runner.run("ffmpeg", [
    normalized.overwrite ? "-y" : "-n", "-v", "error", "-loop", "1", "-t", normalized.durationSeconds.toFixed(3),
    "-i", normalized.sourcePath, "-filter_complex", buildStillImageFilter(normalized), "-map", "[v0]", "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(normalized.fps),
    "-movflags", "+faststart", normalized.outputPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`ffmpeg failed (${result.exitCode}): ${result.stderr.trim()}`);
  return probeMedia(normalized.outputPath, runner);
}

function normalizeSpec(spec: StillImageRenderSpec): Required<StillImageRenderSpec> {
  const width = spec.width ?? 1080;
  const height = spec.height ?? 1920;
  const fps = spec.fps ?? 30;
  const overwrite = spec.overwrite ?? false;
  const focusPoint = spec.focusPoint ?? { x: 0.5, y: 0.5 };
  if (![width, height, fps, spec.durationSeconds].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("width, height, fps and duration must be positive");
  }
  if (![focusPoint.x, focusPoint.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("focus point coordinates must be between 0 and 1");
  }
  const allowed = spec.orientation === "landscape"
    ? ["none", "pan-left", "pan-right"]
    : ["none", "zoom-in", "zoom-out"];
  if (!allowed.includes(spec.motion)) throw new Error(`motion ${spec.motion} is not valid for a ${spec.orientation} image`);
  return { ...spec, width, height, fps, focusPoint, overwrite };
}

function panProgress(durationSeconds: number, focusX: number): string {
  const unitTime = `t/${durationSeconds.toFixed(3)}`;
  const focus = focusX.toFixed(3);
  const fastSlope = (1 + focusDwellStrength).toFixed(3);
  const slowSlope = (1 - focusDwellStrength).toFixed(3);
  if (focusX <= 0) return hermiteExpression(unitTime, slowSlope, fastSlope);
  if (focusX >= 1) return hermiteExpression(unitTime, fastSlope, slowSlope);
  const leftTime = `(${unitTime}/${focus})`;
  const rightTime = `((${unitTime}-${focus})/(1-${focus}))`;
  const left = `${focus}*${hermiteExpression(leftTime, fastSlope, slowSlope)}`;
  const right = `${focus}+(1-${focus})*${hermiteExpression(rightTime, slowSlope, fastSlope)}`;
  return `if(lte(${unitTime}\\,${focus})\\,${left}\\,${right})`;
}

function panCropX(motion: "pan-left" | "pan-right", durationSeconds: number, focusX: number): string {
  const progress = panProgress(durationSeconds, focusX);
  return motion === "pan-left"
    ? `(iw-ow)*clip(1-(${progress})\\,0\\,1)`
    : `(iw-ow)*${progress}`;
}

function zoomPan(spec: Required<StillImageRenderSpec>): string {
  const frames = Math.max(1, Math.round(spec.durationSeconds * spec.fps) - 1);
  const ease = `((1-cos(PI*min(on/${frames},1)))/2)`;
  const zoom = spec.motion === "zoom-in"
    ? `1+${zoomAmount.toFixed(3)}*${ease}`
    : `${(1 + zoomAmount).toFixed(3)}-${zoomAmount.toFixed(3)}*${ease}`;
  const x = `max(0,min(iw-iw/zoom,iw*${spec.focusPoint.x.toFixed(3)}-iw/(2*zoom)))`;
  const y = `max(0,min(ih-ih/zoom,ih*${spec.focusPoint.y.toFixed(3)}-ih/(2*zoom)))`;
  return `,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${spec.width}x${spec.height}:fps=${spec.fps}`;
}

function hermiteExpression(progress: string, startSlope: string, endSlope: string): string {
  const squared = `(${progress})*(${progress})`;
  const cubed = `${squared}*(${progress})`;
  return `((${cubed}-2*${squared}+(${progress}))*${startSlope}`
    + `+(-2*${cubed}+3*${squared})+(${cubed}-${squared})*${endSlope})`;
}
