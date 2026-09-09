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
  readonly segmentPaths?: readonly string[];
  readonly videoPath?: string;
  readonly audioPath: string;
  readonly outputPath: string;
  readonly frameRate: RationalFrameRate;
  readonly totalFrames: number;
  readonly onProgress?: (progress: number) => void;
}

export async function assembleStoryMaster(
  spec: StoryMasterAssemblySpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  const videoPath = spec.videoPath ?? join(dirname(spec.outputPath), "visual-master.mp4");
  const durationSeconds = framesToSeconds(spec.totalFrames, spec.frameRate);
  if (!spec.videoPath) await buildStorySilentVideo({
    segmentPaths: spec.segmentPaths ?? [], outputPath: videoPath,
    frameRate: spec.frameRate, totalFrames: spec.totalFrames,
  }, runner);
  const mux = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", videoPath, "-i", spec.audioPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy",
    "-t", durationSeconds.toFixed(9), "-movflags", "+faststart", spec.outputPath,
  ], undefined, { durationSeconds, onProgress: (value) => spec.onProgress?.(value) });
  if (mux.exitCode !== 0) throw new Error(`story audio mux failed (${mux.exitCode}): ${mux.stderr.trim()}`);
  spec.onProgress?.(1);
}

/** The reusable video pass has no dependency on audio inputs or levels. */
export async function buildStorySilentVideo(
  spec: { readonly segmentPaths: readonly string[]; readonly outputPath: string;
    readonly frameRate: RationalFrameRate; readonly totalFrames: number },
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  if (!spec.segmentPaths.length) throw new Error("story master requires at least one segment");
  const listPath = join(dirname(spec.outputPath), "segments.txt");
  await writeFile(listPath, spec.segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
  const result = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listPath,
    "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", spec.outputPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`story segment concat failed (${result.exitCode}): ${result.stderr.trim()}`);
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

export interface StoryMasterSourceAudioClip {
  readonly path: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export interface StoryMasterAudioSpec {
  readonly outputPath: string;
  readonly durationSeconds: number;
  readonly levels: {
    readonly video: number;
    readonly rhythm: number;
    readonly melody: number;
    readonly duckedMelody: number;
  };
  /** The scenes that carry their own sound, placed on the timeline; the gaps between them stay silent. */
  readonly source: readonly StoryMasterSourceAudioClip[];
  /** Absent for a story with no soundtrack: the master still carries a track of the right length. */
  readonly soundtrack?: { readonly rhythmPath: string; readonly melodyPath: string };
}

/** Matches the transition the preview uses when the melody steps aside for the scene's own sound. */
export const duckingRampSeconds = 0.4;

/**
 * Mixes the master's audio the way the preview plays it: the scenes' own sound at the video level, the rhythm and
 * melody stems at theirs, and the melody stepping aside to `duckedMelody` wherever a scene is heard, ramped over
 * {@link duckingRampSeconds}. Summing is deliberate rather than `amix`'s averaging, so a level of one is as loud
 * as it was in the mixer; the limiter only catches the peaks that summing full stems can produce.
 */
export async function buildStoryMasterAudio(
  spec: StoryMasterAudioSpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  const duration = spec.durationSeconds.toFixed(9);
  const rate = verticalSocialOutputProfile.audioSampleRate;
  const inputs = ["-y", "-v", "error", "-f", "lavfi", "-i", `anullsrc=r=${rate}:cl=stereo`];
  const filters: string[] = [];
  const mixed: string[] = [];
  let index = 1;

  for (const clip of spec.source) {
    inputs.push("-i", clip.path);
    const label = `s${index}`;
    filters.push(`[${index}:a]aresample=${rate},adelay=${Math.round(clip.startSeconds * 1_000)}:all=1,`
      + `apad=whole_dur=${duration},atrim=duration=${duration},volume=${spec.levels.video.toFixed(4)}[${label}]`);
    mixed.push(label);
    index += 1;
  }
  if (spec.soundtrack) {
    inputs.push("-i", spec.soundtrack.rhythmPath, "-i", spec.soundtrack.melodyPath);
    filters.push(`[${index}:a]volume=${spec.levels.rhythm.toFixed(4)}[rhythm]`);
    filters.push(`[${index + 1}:a]volume=${duckingExpression(spec)}:eval=frame[melody]`);
    mixed.push("rhythm", "melody");
    index += 2;
  }
  // The silent base guarantees a track of the exact length even when nothing else plays.
  filters.push(`[0:a]atrim=duration=${duration}[base]`);
  filters.push(`[base]${mixed.map((label) => `[${label}]`).join("")}`
    + `amix=inputs=${mixed.length + 1}:normalize=0:duration=first[summed]`);
  filters.push("[summed]alimiter=limit=0.95[out]");
  const result = await runner.run("ffmpeg", [
    ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]",
    "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "192k",
    "-ar", String(rate), "-ac", String(verticalSocialOutputProfile.audioChannels),
    "-t", duration, "-movflags", "+faststart", spec.outputPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`story master audio failed (${result.exitCode}): ${result.stderr.trim()}`);
}

/** Each boundary cancels the preceding ramp at its current level, just like the preview mixer. */
function duckingExpression(spec: StoryMasterAudioSpec): string {
  const open = spec.levels.melody;
  const ducked = open * spec.levels.duckedMelody;
  const windows = spec.levels.video > 0 ? mergeAudibleWindows(spec.source) : [];
  const initial = windows[0]?.start === 0 ? ducked : open;
  const ramps: { start: number; from: number; to: number }[] = [];
  for (const window of windows) {
    for (const [start, to] of [[window.start, ducked], [window.end, open]] as const) {
      if (start === 0) continue; // Playback initializes the first scene's level without a ramp.
      const previous = ramps.at(-1);
      const from = previous ? previous.from + (previous.to - previous.from)
        * Math.min(1, (start - previous.start) / duckingRampSeconds) : initial;
      ramps.push({ start, from, to });
    }
  }
  let expression = initial.toFixed(9);
  for (const { start, from, to } of ramps) {
    const value = `${from.toFixed(9)}+(${(to - from).toFixed(9)})*min(1,(t-${start.toFixed(9)})/${duckingRampSeconds})`;
    expression = `if(lt(t,${start.toFixed(9)}),${expression},${value})`;
  }
  return `'${expression}'`;
}

/** Clips that touch or overlap are one stretch of sound: the melody has no room to come back up between them. */
function mergeAudibleWindows(source: readonly StoryMasterSourceAudioClip[]): { start: number; end: number }[] {
  const ordered = [...source]
    .map(({ startSeconds, durationSeconds }) => ({ start: startSeconds, end: startSeconds + durationSeconds }))
    .sort((first, second) => first.start - second.start);
  return ordered.reduce<{ start: number; end: number }[]>((merged, window) => {
    const previous = merged.at(-1);
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end);
    else merged.push(window);
    return merged;
  }, []);
}

export async function assertStoryMasterAudio(
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
    throw new Error("story master audio must be AAC-LC 48 kHz stereo");
  }
  const duration = Number(audio.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration * frameRateValue(frameRate) - totalFrames) > 1) {
    throw new Error("story master audio duration differs from the timeline by more than one frame");
  }
}
