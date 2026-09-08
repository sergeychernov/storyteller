import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { SoundtrackProvenance, SoundtrackRenderJob, SoundtrackRenderQueue } from "@storyteller/render-queue";
import {
  assertSoundtrackProfile, encodeSoundtrackPreview, encodeSoundtrackStem, probeSoundtrack,
  type SoundtrackMediaProfile,
} from "@storyteller/renderer";
import {
  createPcm16WaveHeader, generateSoundtrack, soundtrackChannels, soundtrackEngineId, soundtrackEngineVersion,
  soundtrackLicenseVersion, soundtrackSampleRate, type GenerateSoundtrackInput, type SoundtrackPcmChunk,
} from "@storyteller/soundtrack";
import { hashFileContent, type ObjectStorage } from "@storyteller/storage";
import { workerRenderCapacity, type RenderCapacity } from "./render-capacity.js";

type Generator = (input: GenerateSoundtrackInput, write: (chunk: SoundtrackPcmChunk) => Promise<void>) => Promise<unknown>;
type Encode = (source: string, output: string) => Promise<void>;
type Probe = (path: string) => Promise<SoundtrackMediaProfile>;

export interface SoundtrackWorkerLogger {
  info(message: string, details: Record<string, unknown>): void;
  error(message: string, details: Record<string, unknown>): void;
}

export class SoundtrackWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: SoundtrackRenderQueue,
    private readonly storage: ObjectStorage,
    private readonly leaseMilliseconds = 10 * 60 * 1_000,
    private readonly renderCapacity: RenderCapacity = workerRenderCapacity,
    private readonly synthesize: Generator = (input, write) => generateSoundtrack(input, write),
    private readonly encodePreview: Encode = encodeSoundtrackPreview,
    private readonly encodeStem: Encode = encodeSoundtrackStem,
    private readonly probe: Probe = probeSoundtrack,
    private readonly logger: SoundtrackWorkerLogger = console,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.queue.claim(this.workerId, this.leaseMilliseconds);
    if (!job) return false;
    await this.render(job);
    return true;
  }

  private async render(job: SoundtrackRenderJob): Promise<void> {
    const startedAt = Date.now();
    const startingRss = process.memoryUsage.rss();
    const directory = await mkdtemp(join(tmpdir(), "storyteller-soundtrack-"));
    const paths = {
      rhythmWav: join(directory, "rhythm.wav"), melodyWav: join(directory, "melody.wav"), previewWav: join(directory, "preview.wav"),
      rhythmFlac: join(directory, "rhythm.flac"), melodyFlac: join(directory, "melody.flac"), previewM4a: join(directory, "preview.m4a"),
      rhythmM4a: join(directory, "rhythm.m4a"), melodyM4a: join(directory, "melody.m4a"),
    };
    const baseKey = `projects/${job.profileId}/${job.storyId}/soundtracks/${job.inputHash}/${randomUUID()}`;
    const storageKeys = {
      preview: `${baseKey}/soundtrack.m4a`, rhythm: `${baseKey}/rhythm.flac`, melody: `${baseKey}/melody.flac`,
      rhythmPreview: `${baseKey}/rhythm.m4a`, melodyPreview: `${baseKey}/melody.m4a`,
    };
    const uploaded: string[] = [];
    this.logger.info("soundtrack render started", {
      renderId: job.id, presetId: job.input.presetId, durationFrames: job.input.totalFrames,
    });
    try {
      await this.renderCapacity.run(async () => {
        const outputs = [createWriteStream(paths.rhythmWav, { flags: "wx" }), createWriteStream(paths.melodyWav, { flags: "wx" }),
          createWriteStream(paths.previewWav, { flags: "wx" })] as const;
        const header = createPcm16WaveHeader(job.input.totalSampleFrames);
        for (const output of outputs) await writeBuffer(output, header);
        let writtenFrames = 0;
        let reportedBucket = -1;
        try {
          await this.synthesize({
            presetId: job.input.presetId, presetVersion: job.input.presetVersion,
            seed: job.input.seed, totalSampleFrames: job.input.totalSampleFrames,
            melodyVariant: job.input.melodyVariant,
          }, async (chunk) => {
            await Promise.all([
              writeBuffer(outputs[0], chunk.rhythm), writeBuffer(outputs[1], chunk.melody), writeBuffer(outputs[2], chunk.preview),
            ]);
            writtenFrames += chunk.sampleFrames;
            const bucket = Math.floor(writtenFrames / job.input.totalSampleFrames * 12);
            if (bucket > reportedBucket) {
              reportedBucket = bucket;
              await this.queue.reportProgress(job.id, this.workerId, 4 + bucket * 5, "synthesizing");
            }
          });
        } finally {
          await Promise.all(outputs.map(finishStream));
        }
        await this.queue.reportProgress(job.id, this.workerId, 66, "encoding");
        await Promise.all([
          this.encodePreview(paths.previewWav, paths.previewM4a),
          this.encodePreview(paths.rhythmWav, paths.rhythmM4a),
          this.encodePreview(paths.melodyWav, paths.melodyM4a),
          this.encodeStem(paths.rhythmWav, paths.rhythmFlac),
          this.encodeStem(paths.melodyWav, paths.melodyFlac),
        ]);
        await this.queue.reportProgress(job.id, this.workerId, 82, "verifying");
        const expectedDuration = job.input.totalSampleFrames / soundtrackSampleRate;
        const [preview, rhythm, melody, rhythmPreview, melodyPreview] = await Promise.all([
          this.probe(paths.previewM4a), this.probe(paths.rhythmFlac), this.probe(paths.melodyFlac),
          this.probe(paths.rhythmM4a), this.probe(paths.melodyM4a),
        ]);
        assertSoundtrackProfile(preview, "aac", expectedDuration);
        assertSoundtrackProfile(rhythm, "flac", expectedDuration);
        assertSoundtrackProfile(melody, "flac", expectedDuration);
        assertSoundtrackProfile(rhythmPreview, "aac", expectedDuration);
        assertSoundtrackProfile(melodyPreview, "aac", expectedDuration);
      });

      const [previewStat, rhythmStat, melodyStat, rhythmPreviewStat, melodyPreviewStat,
        previewPcmSha256, previewSha256, rhythmSha256, melodySha256, rhythmPreviewSha256, melodyPreviewSha256] = await Promise.all([
        stat(paths.previewM4a), stat(paths.rhythmFlac), stat(paths.melodyFlac), stat(paths.rhythmM4a), stat(paths.melodyM4a),
        hashFileContent(paths.previewWav), hashFileContent(paths.previewM4a), hashFileContent(paths.rhythmFlac),
        hashFileContent(paths.melodyFlac), hashFileContent(paths.rhythmM4a), hashFileContent(paths.melodyM4a),
      ]);
      await this.queue.reportProgress(job.id, this.workerId, 90, "uploading");
      for (const [key, path, contentType, size] of [
        [storageKeys.preview, paths.previewM4a, "audio/mp4", previewStat.size],
        [storageKeys.rhythm, paths.rhythmFlac, "audio/flac", rhythmStat.size],
        [storageKeys.melody, paths.melodyFlac, "audio/flac", melodyStat.size],
        [storageKeys.rhythmPreview, paths.rhythmM4a, "audio/mp4", rhythmPreviewStat.size],
        [storageKeys.melodyPreview, paths.melodyM4a, "audio/mp4", melodyPreviewStat.size],
      ] as const) {
        await this.storage.put(key, { body: createReadStream(path), contentType, contentLength: size });
        uploaded.push(key);
      }
      const provenance: SoundtrackProvenance = {
        origin: "storyteller_procedural", engineId: soundtrackEngineId, engineVersion: soundtrackEngineVersion,
        presetId: job.input.presetId, presetVersion: job.input.presetVersion, seed: job.input.seed,
        melodyVariant: job.input.melodyVariant,
        sampleRate: soundtrackSampleRate, channels: soundtrackChannels, sampleFrames: job.input.totalSampleFrames,
        durationFrames: job.input.totalFrames, frameRate: job.input.frameRate,
        previewPcmSha256, previewSha256, rhythmStemSha256: rhythmSha256, melodyStemSha256: melodySha256,
        rhythmPreviewSha256, melodyPreviewSha256,
        externalAudioAssets: false, licenseVersion: soundtrackLicenseVersion, generatedAt: new Date().toISOString(),
      };
      const completion = await this.queue.complete(job.id, this.workerId, {
        preview: { storageKey: storageKeys.preview, contentHash: previewSha256, sizeBytes: previewStat.size, mimeType: "audio/mp4" },
        rhythmStem: { storageKey: storageKeys.rhythm, contentHash: rhythmSha256, sizeBytes: rhythmStat.size, mimeType: "audio/flac" },
        melodyStem: { storageKey: storageKeys.melody, contentHash: melodySha256, sizeBytes: melodyStat.size, mimeType: "audio/flac" },
        rhythmPreview: { storageKey: storageKeys.rhythmPreview, contentHash: rhythmPreviewSha256,
          sizeBytes: rhythmPreviewStat.size, mimeType: "audio/mp4" },
        melodyPreview: { storageKey: storageKeys.melodyPreview, contentHash: melodyPreviewSha256,
          sizeBytes: melodyPreviewStat.size, mimeType: "audio/mp4" },
      }, provenance);
      const obsolete = completion.accepted ? completion.supersededStorageKeys : uploaded;
      await Promise.all(obsolete.map((key) => this.storage.delete(key).catch(() => undefined)));
      this.logger.info("soundtrack render finished", {
        renderId: job.id, accepted: completion.accepted, supersededObjects: obsolete.length,
        durationMs: Date.now() - startedAt, rssDeltaBytes: process.memoryUsage.rss() - startingRss,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "soundtrack render failed";
      await Promise.all(uploaded.map((key) => this.storage.delete(key).catch(() => undefined)));
      await this.queue.fail(job.id, this.workerId, message);
      this.logger.error("soundtrack render failed", { renderId: job.id, error: message, durationMs: Date.now() - startedAt });
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function writeBuffer(stream: WriteStream, buffer: Buffer): Promise<void> {
  if (!stream.write(buffer)) await once(stream, "drain");
}

async function finishStream(stream: WriteStream): Promise<void> {
  if (stream.closed) return;
  stream.end();
  await once(stream, "finish");
}

/** Test helper used to stand in for an encoder without keeping audio buffers in memory. */
export const copySoundtrackFile: Encode = (source, output) => copyFile(source, output);
