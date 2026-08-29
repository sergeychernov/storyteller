import { videoPixelCrop, type MaterialEdit, type VideoExportMode } from "@storyteller/domain";
import { join, dirname } from "node:path";
import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";
import { prepareVideoAudio } from "./video-audio.js";

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
  readonly lossless?: boolean;
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
  const duration = (end - start).toFixed(6);
  const args = ["-y", "-v", "error"];
  if (includeVideo) args.push("-ss", start.toFixed(6), "-i", spec.sourcePath!);
  if (includeAudio) args.push("-ss", start.toFixed(6), "-i", audioPath!);
  if (includeVideo) {
    const crop = videoPixelCrop(spec.sourceSize.width, spec.sourceSize.height, spec.edit);
    const rotation = spec.edit.rotation === 90 ? ["transpose=clock"]
      : spec.edit.rotation === 180 ? ["hflip", "vflip"] : spec.edit.rotation === 270 ? ["transpose=cclock"] : [];
    args.push("-map", "0:v:0", "-vf", [
      ...rotation, `crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}`, "setsar=1", "setpts=PTS-STARTPTS",
    ].join(","), "-c:v", "libx264", ...(spec.lossless
      ? ["-preset", "ultrafast", "-qp", "0"] : ["-preset", "veryfast", "-crf", "20"]), "-pix_fmt", "yuv420p");
  } else args.push("-vn");
  if (includeAudio) {
    args.push("-map", `${includeVideo ? 1 : 0}:a:0`, "-af",
      `asetpts=PTS-STARTPTS,apad=whole_dur=${duration},atrim=duration=${duration}`,
      "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000");
  } else args.push("-an");
  args.push("-t", duration, "-map_metadata", "-1", "-movflags", "+faststart", spec.outputPath);
  const result = await runner.run("ffmpeg", args);
  if (result.exitCode !== 0) throw new Error(`video export failed (${result.exitCode}): ${result.stderr.trim()}`);
}

async function durationOf(path: string, runner: MediaProcessRunner): Promise<number> {
  const probe = await probeMedia(path, runner) as { streams?: { codec_type?: string; duration?: string }[]; format?: { duration?: string } };
  const duration = [probe.streams?.find((stream) => stream.codec_type === "video")?.duration, probe.format?.duration]
    .map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (!duration) throw new Error("source duration is unavailable");
  return duration;
}
