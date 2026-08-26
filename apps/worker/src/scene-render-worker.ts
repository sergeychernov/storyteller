import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { sceneRenderStorageKey, type SceneRenderJob, type SceneRenderQueue } from "@storyteller/render-queue";
import { renderStillImage, type StillImageRenderSpec } from "@storyteller/renderer";
import type { ObjectStorage } from "@storyteller/storage";

export type StillImageRender = (spec: StillImageRenderSpec) => Promise<unknown>;

export class SceneRenderWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: SceneRenderQueue,
    private readonly storage: ObjectStorage,
    private readonly render: StillImageRender = renderStillImage,
    private readonly leaseMilliseconds = 10 * 60 * 1_000,
  ) {}

  async runOnce(): Promise<boolean> {
    const deletion = await this.queue.claimDeletion(this.workerId, this.leaseMilliseconds);
    if (deletion) {
      try {
        await this.storage.delete(deletion.storageKey);
        await this.queue.completeDeletion(deletion.storageKey, this.workerId);
      } catch (error) {
        await this.queue.failDeletion(deletion.storageKey, this.workerId, errorMessage(error));
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
    const outputPath = join(temporaryDirectory, "scene.mp4");
    const storageKey = sceneRenderStorageKey(job);
    let uploaded = false;
    try {
      await pipeline(await this.storage.open(job.input.material.storageKey), createWriteStream(sourcePath, { flags: "wx" }));
      await this.render({
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
      await this.storage.put(storageKey, {
        body: createReadStream(outputPath), contentType: "video/mp4", contentLength: output.size,
      });
      uploaded = true;
      if (!await this.queue.complete(job.id, this.workerId, storageKey, output.size)) {
        await this.queue.scheduleDeletion(storageKey);
        uploaded = false;
      }
    } catch (error) {
      if (uploaded) await this.storage.delete(storageKey).catch(() => undefined);
      await this.queue.fail(job.id, this.workerId, errorMessage(error));
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".media";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown render error";
}
