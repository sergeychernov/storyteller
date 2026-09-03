import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { StoryExportErrorCode, StoryExportQueue } from "@storyteller/render-queue";
import {
  assembleStoryMaster, assertApprovedStoryMix, assertSegmentProfile, probeVideoProfile, verticalSocialOutputProfile,
} from "@storyteller/renderer";
import { hashFileContent, type ObjectStorage } from "@storyteller/storage";
import { workerRenderCapacity, type RenderCapacity } from "./render-capacity.js";

export class StoryExportWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: StoryExportQueue,
    private readonly storage: ObjectStorage,
    private readonly leaseMilliseconds = 20 * 60 * 1_000,
    private readonly renderCapacity: RenderCapacity = workerRenderCapacity,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.queue.claimAssembly(this.workerId, this.leaseMilliseconds);
    if (!job) return false;
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "storyteller-master-"));
    const outputPath = join(temporaryDirectory, "story.mp4");
    const storageKey = `projects/${job.profileId}/${job.storyId}/exports/${job.manifestHash}-${randomUUID()}.mp4`;
    try {
      const segmentPaths = await Promise.all(job.segments.map(async (segment, index) => {
        if (!segment.storageKey || !segment.contentHash) throw exportError("segment_failed", "ready segment artifact is missing");
        const path = join(temporaryDirectory, `segment-${String(index).padStart(4, "0")}.mp4`);
        await pipeline(await this.storage.open(segment.storageKey), createWriteStream(path, { flags: "wx" }));
        if (await hashFileContent(path) !== segment.contentHash) throw exportError("segment_failed", "segment content hash changed");
        const manifestSegment = job.manifest.segments[index];
        if (!manifestSegment) throw exportError("segment_failed", "segment manifest order is incomplete");
        try {
          assertSegmentProfile(await probeVideoProfile(path), job.manifest.frameRate, manifestSegment.durationFrames);
        } catch (error) {
          throw exportError("segment_profile_mismatch", error instanceof Error ? error.message : "segment profile mismatch");
        }
        return path;
      }));
      const mixPath = join(temporaryDirectory, "approved-mix.m4a");
      await pipeline(await this.storage.open(job.manifest.approvedMix.storageKey), createWriteStream(mixPath, { flags: "wx" }));
      if (await hashFileContent(mixPath) !== job.manifest.approvedMix.contentHash) {
        throw exportError("approved_mix_mismatch", "approved mix content hash changed");
      }
      try {
        await assertApprovedStoryMix(mixPath, job.manifest.totalFrames, job.manifest.frameRate);
      } catch (error) {
        throw exportError("approved_mix_mismatch", error instanceof Error ? error.message : "approved mix profile mismatch");
      }
      await this.queue.reportAssemblyProgress(job.id, this.workerId, 91, "assembling");
      await this.renderCapacity.run(() => assembleStoryMaster({
        segmentPaths, approvedMixPath: mixPath, outputPath,
        frameRate: job.manifest.frameRate, totalFrames: job.manifest.totalFrames,
        onProgress: (value) => { void this.queue.reportAssemblyProgress(job.id, this.workerId, 91 + value * 6, "assembling"); },
      }));
      const result = await probeVideoProfile(outputPath);
      const { audioCodec: _audioCodec, audioSampleRate: _audioSampleRate, audioChannels: _audioChannels, ...video } = result;
      assertSegmentProfile(video, job.manifest.frameRate, job.manifest.totalFrames);
      if (result.audioCodec !== verticalSocialOutputProfile.audioCodec
        || result.audioSampleRate !== verticalSocialOutputProfile.audioSampleRate
        || result.audioChannels !== verticalSocialOutputProfile.audioChannels) {
        throw exportError("approved_mix_mismatch", "master audio does not match the approved mix profile");
      }
      const output = await stat(outputPath);
      const contentHash = await hashFileContent(outputPath);
      await this.queue.reportAssemblyProgress(job.id, this.workerId, 98, "uploading");
      await this.storage.put(storageKey, {
        body: createReadStream(outputPath), contentType: "video/mp4", contentLength: output.size,
      });
      if (!await this.queue.complete(job.id, this.workerId, storageKey, output.size, contentHash)) {
        await this.storage.delete(storageKey).catch(() => undefined);
      }
    } catch (error) {
      const classified = error instanceof StoryExportWorkerError
        ? error : exportError("assembly_failed", error instanceof Error ? error.message : "story assembly failed");
      await this.queue.fail(job.id, this.workerId, classified.code, classified.message);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    return true;
  }
}

class StoryExportWorkerError extends Error {
  constructor(readonly code: StoryExportErrorCode, message: string) { super(message); }
}
function exportError(code: StoryExportErrorCode, message: string): StoryExportWorkerError {
  return new StoryExportWorkerError(code, message);
}
