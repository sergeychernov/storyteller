import { createReadStream } from "node:fs";
import { SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";

const sampleRate = 8_000;
const bytesPerFrame = 4; // Two signed 16-bit channels; opposite phases must not cancel out.

export class PcmWaveform {
  private readonly peaks: number[];
  private frame = 0;
  private remainder = Buffer.alloc(0);

  constructor(private readonly frameCount: number, pointCount = 512) {
    if (!Number.isFinite(frameCount) || frameCount <= 0 || !Number.isInteger(pointCount) || pointCount < 1) {
      throw new Error("waveform dimensions must be positive");
    }
    this.peaks = Array<number>(pointCount).fill(0);
  }

  add(chunk: Buffer): void {
    const bytes = this.remainder.length ? Buffer.concat([this.remainder, chunk]) : chunk;
    const usable = bytes.length - bytes.length % bytesPerFrame;
    for (let offset = 0; offset < usable; offset += bytesPerFrame, this.frame += 1) {
      const index = Math.floor(this.frame / this.frameCount * this.peaks.length);
      if (index >= this.peaks.length) break;
      const amplitude = Math.max(Math.abs(bytes.readInt16LE(offset)), Math.abs(bytes.readInt16LE(offset + 2)));
      this.peaks[index] = Math.max(this.peaks[index]!, amplitude);
    }
    this.remainder = Buffer.from(bytes.subarray(usable));
  }

  normalized(): number[] {
    const maximum = Math.max(...this.peaks);
    return maximum === 0 ? [...this.peaks] : this.peaks.map((peak) => Math.round(peak / maximum * 10_000) / 10_000);
  }
}

export async function extractAudioWaveform(spec: {
  readonly sourcePath: string;
  readonly pcmPath: string;
  readonly durationSeconds: number;
}, runner: MediaProcessRunner = new SpawnMediaProcessRunner()): Promise<number[]> {
  const waveform = new PcmWaveform(spec.durationSeconds * sampleRate);
  const result = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", spec.sourcePath, "-map", "0:a:0", "-vn",
    "-t", spec.durationSeconds.toFixed(6), "-ac", "2", "-ar", String(sampleRate),
    "-af", "aresample=async=1:first_pts=0", "-c:a", "pcm_s16le", "-f", "s16le", spec.pcmPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`waveform extraction failed (${result.exitCode}): ${result.stderr.trim()}`);
  for await (const chunk of createReadStream(spec.pcmPath)) waveform.add(chunk as Buffer);
  return waveform.normalized();
}
