import { defaultStoryFrameRate, frameRateExpression, framesToSeconds, videoPixelCrop, type MaterialEdit, type RationalFrameRate, type VideoExportMode } from "@storyteller/domain";
import { join, dirname } from "node:path";
import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";
import { prepareVideoAudio } from "./video-audio.js";
import { h264SegmentArguments } from "./h264.js";
import { buildTitleOverlayFilter, titleOverlayInputArguments, type TitleOverlaySpec } from "./title-overlay.js";

export const videoRendererVersion = 1;

export interface VideoRenderSpec {
  readonly sourcePath?: string;
  readonly audioPath?: string;
  readonly outputPath: string;
  readonly sourceSize: { readonly width: number; readonly height: number };
  readonly sourceDurationSeconds?: number;
  readonly hasAudio: boolean;
  readonly mode: VideoExportMode;
  readonly edit: MaterialEdit;
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: RationalFrameRate;
  readonly durationFrames?: number;
  readonly lossless?: boolean;
  readonly onProgress?: (progress: number) => void;
  readonly titleOverlay?: TitleOverlaySpec;
}

export async function renderVideo(spec: VideoRenderSpec, runner: MediaProcessRunner = new SpawnMediaProcessRunner()): Promise<void> {
  const includeVideo = spec.mode !== "audio";
  const includeAudio = spec.mode !== "video" && spec.hasAudio;
  if (spec.mode === "audio" && !spec.hasAudio) throw new Error("video has no audio track");
  if (includeVideo && !spec.sourcePath) throw new Error("video source is required");
  let audioPath = spec.audioPath;
  if (includeAudio && !audioPath) {
    if (!spec.sourcePath) throw new Error("audio source is required");
    // Compatibility for uploads made before separate working tracks were introduced.
    audioPath = join(dirname(spec.outputPath), "processed-audio.m4a");
    await prepareVideoAudio(spec.sourcePath, audioPath, runner);
  }
  const sourceDuration = spec.sourceDurationSeconds ?? await durationOf(spec.sourcePath ?? audioPath!, runner);
  const start = spec.edit.trim?.startSeconds ?? 0;
  const end = spec.edit.trim?.endSeconds ?? sourceDuration;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > sourceDuration + 0.001) {
    throw new Error("video trim must be within the source duration");
  }
  const frameRate = spec.frameRate ?? defaultStoryFrameRate;
  const frameDuration = spec.durationFrames ? framesToSeconds(spec.durationFrames, frameRate) : end - start;
  const duration = frameDuration.toFixed(9);
  const args = ["-y", "-v", "error"];
  if (includeVideo) args.push("-ss", start.toFixed(6), "-i", spec.sourcePath!);
  if (includeAudio) args.push("-ss", start.toFixed(6), "-i", audioPath!);
  if (includeVideo && spec.titleOverlay) args.push(...titleOverlayInputArguments(spec.titleOverlay, Number(duration)));
  if (includeVideo) {
    const crop = videoPixelCrop(spec.sourceSize.width, spec.sourceSize.height, spec.edit);
    const rotation = spec.edit.rotation === 90 ? ["transpose=clock"]
      : spec.edit.rotation === 180 ? ["hflip", "vflip"] : spec.edit.rotation === 270 ? ["transpose=cclock"] : [];
    const geometry = spec.width && spec.height
      ? [`scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase`, `crop=${spec.width}:${spec.height}`]
      : [];
    const videoFilters = [
      ...rotation, `crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}`, ...geometry, "setsar=1",
      ...(spec.durationFrames ? [`tpad=stop_mode=clone:stop_duration=${duration}`] : []),
      `fps=${frameRateExpression(frameRate)}`, ...(spec.durationFrames ? [`trim=end_frame=${spec.durationFrames}`] : []), "setpts=PTS-STARTPTS",
    ].join(",");
    if (spec.titleOverlay) {
      const titleInputIndex = (includeVideo ? 1 : 0) + (includeAudio ? 1 : 0);
      args.push("-filter_complex", `[0:v]${videoFilters},format=rgba[title-base];`
        + buildTitleOverlayFilter("title-base", titleInputIndex, spec.titleOverlay, "title-composited")
        + ";[title-composited]format=yuv420p[v0]", "-map", "[v0]");
    } else args.push("-map", "0:v:0", "-vf", videoFilters);
    args.push(...h264SegmentArguments(frameRate, spec.lossless ?? false, spec.durationFrames ? 1 : 2),
    ...(spec.durationFrames ? ["-frames:v", String(spec.durationFrames)] : []));
  } else args.push("-vn");
  if (includeAudio) {
    args.push("-map", `${includeVideo ? 1 : 0}:a:0`, "-af",
      `asetpts=PTS-STARTPTS,apad=whole_dur=${duration},atrim=duration=${duration}`,
      "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000");
  } else args.push("-an");
  args.push("-t", duration, "-map_metadata", "-1", spec.outputPath);
  const result = await runner.run("ffmpeg", args, undefined, spec.onProgress ? {
    durationSeconds: Number(duration),
    onProgress: spec.onProgress,
  } : undefined);
  if (result.exitCode !== 0) throw new Error(`video export failed (${result.exitCode}): ${result.stderr.trim()}`);
}

async function durationOf(path: string, runner: MediaProcessRunner): Promise<number> {
  const probe = await probeMedia(path, runner) as { streams?: { codec_type?: string; duration?: string }[]; format?: { duration?: string } };
  const duration = [probe.streams?.find((stream) => stream.codec_type === "video")?.duration, probe.format?.duration]
    .map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (!duration) throw new Error("source duration is unavailable");
  return duration;
}
