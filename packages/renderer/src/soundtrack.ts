import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";

export interface SoundtrackMediaProfile {
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
}

export async function encodeSoundtrackPreview(
  sourceWavPath: string,
  outputPath: string,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  await run(runner, [
    "-y", "-hide_banner", "-v", "error", "-i", sourceWavPath, "-map", "0:a:0", "-map_metadata", "-1",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", outputPath,
  ]);
}

export async function encodeSoundtrackStem(
  sourceWavPath: string,
  outputPath: string,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  await run(runner, [
    "-y", "-hide_banner", "-v", "error", "-i", sourceWavPath, "-map", "0:a:0", "-map_metadata", "-1",
    "-c:a", "flac", "-compression_level", "8", "-ar", "48000", "-ac", "2", outputPath,
  ]);
}

export async function probeSoundtrack(
  path: string,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<SoundtrackMediaProfile> {
  const value = await probeMedia(path, runner) as MediaProbe;
  const audio = value.streams?.find(({ codec_type }) => codec_type === "audio");
  const durationSeconds = finite(audio?.duration) ?? finite(value.format?.duration);
  const sampleRate = Number(audio?.sample_rate);
  const channels = Number(audio?.channels);
  if (!audio?.codec_name || !durationSeconds || durationSeconds <= 0
    || !Number.isFinite(sampleRate) || !Number.isFinite(channels)) throw new Error("soundtrack media profile is incomplete");
  return { codec: audio.codec_name, sampleRate, channels, durationSeconds };
}

export function assertSoundtrackProfile(
  profile: SoundtrackMediaProfile,
  expectedCodec: "aac" | "flac",
  expectedDurationSeconds: number,
): void {
  if (profile.codec !== expectedCodec || profile.sampleRate !== 48_000 || profile.channels !== 2) {
    throw new Error(`soundtrack profile must be ${expectedCodec}, stereo, and 48 kHz`);
  }
  if (Math.abs(profile.durationSeconds - expectedDurationSeconds) > 1 / 30 + 1e-6) {
    throw new Error("soundtrack duration differs by more than one video frame");
  }
}

async function run(runner: MediaProcessRunner, args: readonly string[]): Promise<void> {
  const result = await runner.run("ffmpeg", args);
  if (result.exitCode !== 0) throw new Error(`soundtrack encoding failed (${result.exitCode}): ${result.stderr.trim()}`);
}

function finite(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface MediaProbe {
  readonly streams?: readonly {
    readonly codec_type?: string; readonly codec_name?: string; readonly sample_rate?: string;
    readonly channels?: number; readonly duration?: string;
  }[];
  readonly format?: { readonly duration?: string };
}
