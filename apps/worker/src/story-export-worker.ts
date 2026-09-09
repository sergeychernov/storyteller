import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type {
  ClaimedStoryExport, StoryExportErrorCode, StoryExportManifest, StoryExportQueue,
} from "@storyteller/render-queue";
import { framesToSeconds } from "@storyteller/domain";
import {
  assembleStoryMaster, assertSegmentProfile, assertStoryMasterAudio, buildStoryMasterAudio, probeVideoProfile,
  verticalSocialOutputProfile, SpawnMediaProcessRunner, type MediaProcessRunner, type StoryMasterSourceAudioClip,
} from "@storyteller/renderer";
import { hashFileContent, type ObjectStorage } from "@storyteller/storage";
import { workerRenderCapacity, type RenderCapacity } from "./render-capacity.js";
import { prepareStoryExportVideo, StoryExportVideoError } from "./story-export-video.js";

export class StoryExportWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: StoryExportQueue,
    private readonly storage: ObjectStorage,
    private readonly leaseMilliseconds = 20 * 60 * 1_000,
    private readonly renderCapacity: RenderCapacity = workerRenderCapacity,
    private readonly runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
  ) {}

  /**
   * The scenes' own sound, each already trimmed and padded to its scene by the audio-mode render, placed at the
   * position the timeline gives it. Scenes without sound contribute nothing and stay silent in the mix.
   */
  private async fetchSourceAudio(job: ClaimedStoryExport, directory: string): Promise<StoryMasterSourceAudioClip[]> {
    const starts = new Map<number, number>();
    let frame = 0;
    for (const segment of job.manifest.segments) {
      starts.set(segment.position, frame);
      frame += segment.durationFrames;
    }
    return Promise.all(job.audioSegments.map(async (segment, index) => {
      const manifestSegment = job.manifest.audioSegments[index];
      if (!manifestSegment) throw exportError("segment_failed", "audio segment manifest order is incomplete");
      if (!segment.storageKey || !segment.contentHash) throw exportError("segment_failed", "ready audio segment is missing");
      const path = join(directory, `scene-audio-${String(index).padStart(4, "0")}.m4a`);
      await pipeline(await this.storage.open(segment.storageKey), createWriteStream(path, { flags: "wx" }));
      if (await hashFileContent(path) !== segment.contentHash) {
        throw exportError("segment_failed", "audio segment content hash changed");
      }
      return {
        path,
        startSeconds: framesToSeconds(starts.get(manifestSegment.position) ?? 0, job.manifest.frameRate),
        durationSeconds: framesToSeconds(manifestSegment.durationFrames, job.manifest.frameRate),
      };
    }));
  }

  /** The stems are lossless, so the master's music is mixed from them rather than from the listening preview. */
  private async fetchStems(
    soundtrack: NonNullable<StoryExportManifest["soundtrack"]>,
    directory: string,
  ): Promise<{ rhythmPath: string; melodyPath: string }> {
    const paths = await Promise.all((["rhythm", "melody"] as const).map(async (stem) => {
      const path = join(directory, `${stem}.flac`);
      await pipeline(await this.storage.open(soundtrack[stem].storageKey), createWriteStream(path, { flags: "wx" }));
      if (await hashFileContent(path) !== soundtrack[stem].contentHash) {
        throw exportError("soundtrack_mismatch", `${stem} stem content hash changed`);
      }
      return path;
    }));
    return { rhythmPath: paths[0]!, melodyPath: paths[1]! };
  }

  async runOnce(): Promise<boolean> {
    const job = await this.queue.claimAssembly(this.workerId, this.leaseMilliseconds);
    if (!job) return false;
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "storyteller-master-"));
    const outputPath = join(temporaryDirectory, "story.mp4");
    const storageKey = `projects/${job.profileId}/${job.storyId}/exports/${job.manifestHash}-${randomUUID()}.mp4`;
    try {
      const videoPath = await prepareStoryExportVideo(
        job, this.workerId, temporaryDirectory, this.queue, this.storage, this.renderCapacity, this.runner,
      );
      const audioPath = join(temporaryDirectory, "master-audio.m4a");
      const stems = job.manifest.soundtrack && await this.fetchStems(job.manifest.soundtrack, temporaryDirectory);
      const source = await this.fetchSourceAudio(job, temporaryDirectory);
      try {
        await buildStoryMasterAudio({
          outputPath: audioPath, durationSeconds: framesToSeconds(job.manifest.totalFrames, job.manifest.frameRate),
          levels: job.manifest.levels, source,
          ...(stems ? { soundtrack: stems } : {}),
        }, this.runner);
        await assertStoryMasterAudio(audioPath, job.manifest.totalFrames, job.manifest.frameRate, this.runner);
      } catch (error) {
        throw exportError("soundtrack_mismatch", error instanceof Error ? error.message : "story master audio failed");
      }
      await this.queue.reportAssemblyProgress(job.id, this.workerId, 91, "assembling");
      await this.renderCapacity.run(() => assembleStoryMaster({
        videoPath, audioPath, outputPath,
        frameRate: job.manifest.frameRate, totalFrames: job.manifest.totalFrames,
        onProgress: (value) => { void this.queue.reportAssemblyProgress(job.id, this.workerId, 91 + value * 6, "assembling"); },
      }, this.runner));
      await assertStoryMasterAudio(outputPath, job.manifest.totalFrames, job.manifest.frameRate, this.runner);
      const result = await probeVideoProfile(outputPath, this.runner);
      const { audioCodec: _audioCodec, audioSampleRate: _audioSampleRate, audioChannels: _audioChannels, ...video } = result;
      assertSegmentProfile(video, job.manifest.frameRate, job.manifest.totalFrames);
      if (result.audioCodec !== verticalSocialOutputProfile.audioCodec
        || result.audioSampleRate !== verticalSocialOutputProfile.audioSampleRate
        || result.audioChannels !== verticalSocialOutputProfile.audioChannels) {
        throw exportError("soundtrack_mismatch", "master audio does not match the output profile");
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
      const classified = error instanceof StoryExportWorkerError || error instanceof StoryExportVideoError
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
