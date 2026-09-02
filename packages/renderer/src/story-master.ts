import { frameRateExpression, frameRateValue, framesToSeconds, type RationalFrameRate } from "@storyteller/domain";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";

export const verticalSocialOutputProfile = {
  id: "vertical-social-v1",
  width: 1080,
  height: 1920,
  videoCodec: "h264",
  videoProfile: "High",
  videoLevel: 42,
  pixelFormat: "yuv420p",
  sampleAspectRatio: "1:1",
  fieldOrder: "progressive",
  colorRange: "tv",
  colorSpace: "bt709",
  colorTransfer: "bt709",
  colorPrimaries: "bt709",
  audioCodec: "aac",
  audioSampleRate: 48000,
  audioChannels: 2,
} as const;

export interface StoryMasterAssemblySpec {
  readonly segmentPaths: readonly string[];
  readonly approvedMixPath: string;
  readonly outputPath: string;
  readonly frameRate: RationalFrameRate;
  readonly totalFrames: number;
  readonly onProgress?: (progress: number) => void;
}

export async function assembleStoryMaster(
  spec: StoryMasterAssemblySpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  if (!spec.segmentPaths.length) throw new Error("story master requires at least one segment");
  const listPath = join(dirname(spec.outputPath), "segments.txt");
  await writeFile(listPath, spec.segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
  const videoPath = join(dirname(spec.outputPath), "visual-master.mp4");
  const durationSeconds = framesToSeconds(spec.totalFrames, spec.frameRate);
  const concat = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listPath,
    "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", videoPath,
  ], undefined, { durationSeconds, onProgress: (value) => spec.onProgress?.(value * 0.45) });
  if (concat.exitCode !== 0) throw new Error(`story segment concat failed (${concat.exitCode}): ${concat.stderr.trim()}`);
  const mux = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", videoPath, "-i", spec.approvedMixPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy",
    "-t", durationSeconds.toFixed(9), "-movflags", "+faststart", spec.outputPath,
  ], undefined, { durationSeconds, onProgress: (value) => spec.onProgress?.(0.45 + value * 0.55) });
  if (mux.exitCode !== 0) throw new Error(`story audio mux failed (${mux.exitCode}): ${mux.stderr.trim()}`);
  spec.onProgress?.(1);
}

export interface ProbedVideoProfile {
  readonly width: number;
  readonly height: number;
  readonly frameRate: string;
  readonly frameCount: number;
  readonly videoCodec: string;
  readonly videoProfile: string;
  readonly videoLevel: number;
  readonly pixelFormat: string;
  readonly sampleAspectRatio: string;
  readonly fieldOrder: string;
  readonly timeBase: string;
  readonly colorRange: string;
  readonly colorSpace: string;
  readonly colorTransfer: string;
  readonly colorPrimaries: string;
  readonly audioCodec?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
}

export async function probeVideoProfile(
  path: string,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<ProbedVideoProfile> {
  const probe = await probeMedia(path, runner) as {
    streams?: Array<Record<string, unknown>>;
  };
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("rendered file has no video stream");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  return {
    width: Number(video.width), height: Number(video.height),
    frameRate: String(video.avg_frame_rate ?? video.r_frame_rate ?? ""),
    frameCount: Number(video.nb_frames), videoCodec: String(video.codec_name ?? ""),
    videoProfile: String(video.profile ?? ""), videoLevel: Number(video.level), pixelFormat: String(video.pix_fmt ?? ""),
    sampleAspectRatio: String(video.sample_aspect_ratio ?? ""), fieldOrder: String(video.field_order ?? ""),
    timeBase: String(video.time_base ?? ""), colorRange: String(video.color_range ?? ""),
    colorSpace: String(video.color_space ?? ""), colorTransfer: String(video.color_transfer ?? ""),
    colorPrimaries: String(video.color_primaries ?? ""),
    ...(audio ? {
      audioCodec: String(audio.codec_name ?? ""), audioSampleRate: Number(audio.sample_rate), audioChannels: Number(audio.channels),
    } : {}),
  };
}

export function assertSegmentProfile(
  actual: ProbedVideoProfile,
  frameRate: RationalFrameRate,
  durationFrames: number,
): void {
  const expectedRate = frameRateExpression(frameRate);
  const expectedTimeBase = `1/${frameRate.numerator * 1_000}`;
  if (actual.width !== verticalSocialOutputProfile.width || actual.height !== verticalSocialOutputProfile.height
    || actual.frameRate !== expectedRate || actual.frameCount !== durationFrames
    || actual.videoCodec !== verticalSocialOutputProfile.videoCodec
    || actual.videoProfile !== verticalSocialOutputProfile.videoProfile || actual.videoLevel !== verticalSocialOutputProfile.videoLevel
    || actual.pixelFormat !== verticalSocialOutputProfile.pixelFormat
    || actual.sampleAspectRatio !== verticalSocialOutputProfile.sampleAspectRatio
    || actual.fieldOrder !== verticalSocialOutputProfile.fieldOrder || actual.timeBase !== expectedTimeBase
    || actual.colorRange !== verticalSocialOutputProfile.colorRange || actual.colorSpace !== verticalSocialOutputProfile.colorSpace
    || actual.colorTransfer !== verticalSocialOutputProfile.colorTransfer || actual.colorPrimaries !== verticalSocialOutputProfile.colorPrimaries
    || actual.audioCodec) {
    throw new Error(`story segment does not match the immutable output profile: ${JSON.stringify(actual)}`);
  }
}

export async function assertApprovedStoryMix(
  path: string,
  totalFrames: number,
  frameRate: RationalFrameRate,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  const probe = await probeMedia(path, runner) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (!audio || audio.codec_name !== verticalSocialOutputProfile.audioCodec
    || audio.profile !== "LC"
    || Number(audio.sample_rate) !== verticalSocialOutputProfile.audioSampleRate
    || Number(audio.channels) !== verticalSocialOutputProfile.audioChannels) {
    throw new Error("approved mix must be AAC-LC 48 kHz stereo");
  }
  const duration = Number(audio.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration * frameRateValue(frameRate) - totalFrames) > 1) {
    throw new Error("approved mix duration differs from the timeline by more than one frame");
  }
}
