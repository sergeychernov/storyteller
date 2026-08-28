import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { sceneRenderFileType, sceneRenderStorageKey, type SceneRenderJob, type SceneRenderQueue } from "@storyteller/render-queue";
import { renderStillImage, renderVideo, type StillImageRenderSpec, type VideoRenderSpec } from "@storyteller/renderer";
import { hashFileContent, type ObjectStorage } from "@storyteller/storage";

export type StillImageRender = (spec: StillImageRenderSpec) => Promise<unknown>;

export interface SceneRenderWorkerLogger {
  info(message: string, details: Record<string, unknown>): void;
  error(message: string, details: Record<string, unknown>): void;
}

export class SceneRenderWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: SceneRenderQueue,
    private readonly storage: ObjectStorage,
    private readonly render: StillImageRender = renderStillImage,
    private readonly leaseMilliseconds = 10 * 60 * 1_000,
    private readonly logger: SceneRenderWorkerLogger = console,
    private readonly renderMotionVideo: (spec: VideoRenderSpec) => Promise<unknown> = renderVideo,
  ) {}

  async runOnce(): Promise<boolean> {
    const deletion = await this.queue.claimDeletion(this.workerId, this.leaseMilliseconds);
    if (deletion) {
      try {
        await this.storage.delete(deletion.storageKey);
        await this.queue.completeDeletion(deletion.storageKey, this.workerId);
      } catch (error) {
        const message = errorMessage(error);
        this.logger.error("object deletion failed", { storageKey: deletion.storageKey, error: message });
        await this.queue.failDeletion(deletion.storageKey, this.workerId, message);
      }
      return true;
    }

    const job = await this.queue.claim(this.workerId, this.leaseMilliseconds);
    if (!job) return false;
    await this.renderJob(job);
    return true;
  }

  private async renderJob(job: SceneRenderJob): Promise<void> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "storyteller-render-"));
    const sourcePath = join(temporaryDirectory, `source${safeExtension(job.input.material.name)}`);
    const file = sceneRenderFileType(job.input);
    const outputPath = join(temporaryDirectory, `scene.${file.extension}`);
    // A worker whose lease expires must never overwrite/delete another attempt's result.
    const storageKey = sceneRenderStorageKey(job, randomUUID());
    let uploaded = false;
    let stage: "download" | "render" | "upload" | "complete" = "download";
    this.logger.info("scene render started", renderLogDetails(job));
    try {
      const input = job.input;
      const needsVideoSource = input.rendererId !== "video" || input.mode !== "audio" || !input.audio;
      if (needsVideoSource) await pipeline(await this.storage.open(input.material.storageKey), createWriteStream(sourcePath, { flags: "wx" }));
      if (needsVideoSource) await verifySource(sourcePath, input.material.contentHash);
      const audioPath = input.rendererId === "video" && input.mode !== "video" && input.audio
        ? join(temporaryDirectory, `audio${safeExtension(input.audio.name)}`) : undefined;
      if (audioPath && input.rendererId === "video" && input.audio) {
        await pipeline(await this.storage.open(input.audio.storageKey), createWriteStream(audioPath, { flags: "wx" }));
        await verifySource(audioPath, input.audio.contentHash);
      }
      stage = "render";
      if (input.rendererId === "video") await this.renderMotionVideo({
        ...(needsVideoSource ? { sourcePath } : {}), ...(audioPath ? { audioPath } : {}), outputPath,
        sourceSize: { width: input.material.width, height: input.material.height },
        ...(input.sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds: input.sourceDurationSeconds }),
        hasAudio: input.hasAudio, mode: input.mode, edit: input.edit,
      });
      else await this.render({
        sourcePath,
        outputPath,
        sourceSize: { width: job.input.material.width, height: job.input.material.height },
        orientation: job.input.material.orientation,
        durationSeconds: job.input.durationSeconds,
        motion: job.input.motion,
        focusPoint: job.input.focusPoint,
        width: job.input.output.width,
        height: job.input.output.height,
        fps: job.input.output.fps,
        overwrite: true,
      });
      const output = await stat(outputPath);
      const contentHash = await hashFileContent(outputPath);
      stage = "upload";
      await this.storage.put(storageKey, {
        body: createReadStream(outputPath), contentType: file.mimeType, contentLength: output.size,
      });
      uploaded = true;
      stage = "complete";
      if (!await this.queue.complete(job.id, this.workerId, storageKey, output.size, contentHash)) {
        await this.queue.scheduleDeletion(storageKey);
        uploaded = false;
      } else {
        this.logger.info("scene render completed", { ...renderLogDetails(job), sizeBytes: output.size });
      }
    } catch (error) {
      const message = errorMessage(error);
      this.logger.error("scene render failed", { ...renderLogDetails(job), stage, error: message });
      if (uploaded) await this.storage.delete(storageKey).catch(() => undefined);
      await this.queue.fail(job.id, this.workerId, message);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function renderLogDetails(job: SceneRenderJob): Record<string, unknown> {
  return {
    renderId: job.id,
    storyId: job.storyId,
    sceneId: job.sceneId,
    rendererId: job.input.rendererId,
    motion: job.input.motion,
    durationSeconds: job.input.durationSeconds,
    sourceWidth: job.input.material.width,
    sourceHeight: job.input.material.height,
    outputWidth: job.input.output.width,
    outputHeight: job.input.output.height,
  };
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".media";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown render error";
}

async function verifySource(path: string, expectedHash: string | undefined): Promise<void> {
  if (expectedHash && await hashFileContent(path) !== expectedHash) {
    throw new Error("source content does not match the saved render version");
  }
}
