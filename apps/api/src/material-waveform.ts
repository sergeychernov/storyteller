import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { VideoMaterial } from "@storyteller/domain";
import { extractAudioWaveform, probeMedia, type MediaProcessRunner } from "@storyteller/renderer";
import type { ObjectStorage } from "@storyteller/storage";

export async function readMaterialWaveform(material: VideoMaterial, objects: ObjectStorage, runner: MediaProcessRunner): Promise<number[]> {
  if (!material.hasAudio) return [];
  const root = resolve(process.env.MEDIA_TEMP_ROOT?.trim() || tmpdir());
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "storyteller-waveform-"));
  const sourcePath = join(directory, "source.media");
  try {
    await pipeline(await objects.open(material.audioTrack?.storageKey ?? material.storageKey), createWriteStream(sourcePath, { flags: "wx" }));
    const durationSeconds = material.sourceDurationSeconds ?? material.videoTrack?.durationSeconds ?? probeDuration(await probeMedia(sourcePath, runner));
    return await extractAudioWaveform({ sourcePath, pcmPath: join(directory, "audio.pcm"), durationSeconds }, runner);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function probeDuration(probe: unknown): number {
  const data = probe as { streams?: { codec_type?: string; duration?: string }[]; format?: { duration?: string } };
  const duration = [data.streams?.find(({ codec_type }) => codec_type === "video")?.duration, data.format?.duration]
    .map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (duration === undefined) throw new Error("video duration is unavailable");
  return duration;
}
