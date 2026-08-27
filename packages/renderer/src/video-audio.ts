import type { AudioTrack } from "@storyteller/domain";
import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";

// Baseline from hermes-story-skills/photo-story-archive: no gates or silence removal.
export const videoAudioFilter = "afftdn=nr=12:nf=-35:tn=1,loudnorm=I=-16:LRA=11:TP=-1.5";
export const videoAudioProcessingVersion = 1;

export async function prepareVideoAudio(
  sourcePath: string,
  outputPath: string,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<Pick<AudioTrack, "durationSeconds" | "sampleRate" | "channels" | "processing">> {
  const source = await probeMedia(sourcePath, runner) as MediaProbe;
  const video = source.streams?.find((stream) => stream.codec_type === "video");
  if (!source.streams?.some((stream) => stream.codec_type === "audio")) throw new Error("source has no audio track");
  const videoStart = finite(video?.start_time) ?? finite(source.format?.start_time) ?? 0;
  // Keep delayed sound in place instead of shifting it to the start of the video.
  const align = `asetpts=PTS-(${videoStart.toFixed(6)})/TB,aresample=48000:async=1:first_pts=0`;
  const input = ["-copyts", "-i", sourcePath, "-map", "0:a:0", "-vn"];
  const measured = await run(runner, [
    ...input, "-af", `${align},${videoAudioFilter}:print_format=json`, "-ac", "2", "-ar", "48000", "-f", "null", "-",
  ]);
  const stats = loudnessStats(measured);
  const fields = ["input_i", "input_lra", "input_tp", "input_thresh", "target_offset"] as const;
  // Silence has -inf measurements and cannot use loudnorm's measured_* options.
  const secondPass = fields.every((key) => finite(stats[key]) !== undefined)
    ? `:measured_I=${stats.input_i}:measured_LRA=${stats.input_lra}:measured_TP=${stats.input_tp}`
      + `:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
    : "";
  // FFmpeg's dynamic loudnorm can produce NaNs on a completely silent short track.
  // There is no meaningful gain to apply below the loudness gate.
  const filter = `${align},${finite(stats.input_i) === undefined ? "afftdn=nr=12:nf=-35:tn=1" : videoAudioFilter + secondPass}`;
  await run(runner, [
    ...input, "-af", filter,
    "-map_metadata", "-1", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000", "-movflags", "+faststart", outputPath,
  ]);
  const output = await probeMedia(outputPath, runner) as MediaProbe;
  const audio = output.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = finite(audio?.duration) ?? finite(output.format?.duration);
  if (!durationSeconds || durationSeconds <= 0 || audio?.sample_rate !== "48000" || audio.channels !== 2) {
    throw new Error("processed audio has invalid duration, sample rate or channels");
  }
  // Decode the finished AAC, not just the filter output, and retain actual measurements.
  const encoded = loudnessStats(await run(runner, [
    "-i", outputPath, "-map", "0:a:0", "-af", "loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json", "-f", "null", "-",
  ]));
  const truePeakDbfs = finite(encoded.input_tp) ?? null;
  if (truePeakDbfs !== null && truePeakDbfs >= 0) throw new Error("processed audio clips after AAC encoding");
  return {
    durationSeconds, sampleRate: 48_000, channels: 2,
    processing: {
      version: videoAudioProcessingVersion, filter,
      integratedLufs: finite(encoded.input_i) ?? null, truePeakDbfs,
    },
  };
}

async function run(runner: MediaProcessRunner, args: readonly string[]): Promise<string> {
  const result = await runner.run("ffmpeg", ["-y", "-hide_banner", "-nostats", "-v", "info", ...args]);
  if (result.exitCode !== 0) throw new Error(`audio processing failed (${result.exitCode}): ${result.stderr.trim()}`);
  return result.stderr;
}

function loudnessStats(stderr: string): Record<string, string> {
  const json = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g)?.at(-1);
  if (!json) throw new Error("audio loudness measurement is unavailable");
  return JSON.parse(json) as Record<string, string>;
}

function finite(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

interface MediaProbe {
  streams?: { codec_type?: string; start_time?: string; duration?: string; sample_rate?: string; channels?: number }[];
  format?: { start_time?: string; duration?: string };
}
