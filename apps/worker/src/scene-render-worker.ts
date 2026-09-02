import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  sceneRenderFileType, sceneRenderStorageKey, type SceneRenderJob, type SceneRenderProgressPhase, type SceneRenderQueue,
} from "@storyteller/render-queue";
import {
  renderCollage, renderLastFrame, renderStillImage, renderVideo,
  type CollageRenderSpec, type LastFrameRenderSpec, type StillImageRenderSpec, type VideoRenderSpec,
} from "@storyteller/renderer";
import { hashFileContent, type ObjectStorage } from "@storyteller/storage";

export type StillImageRender = (spec: StillImageRenderSpec) => Promise<unknown>;
export type LastFrameRender = (spec: LastFrameRenderSpec) => Promise<unknown>;
export type CollageRender = (spec: CollageRenderSpec) => Promise<unknown>;

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
    private readonly renderFrame: LastFrameRender = renderLastFrame,
    private readonly renderPhotoCollage: CollageRender = renderCollage,
  ) {}

  async runOnce(kind?: "interactive" | "story-export-segment"): Promise<boolean> {
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

    const job = await this.queue.claim(this.workerId, this.leaseMilliseconds, kind);
    if (!job) return false;
    await this.renderJob(job);
    return true;
  }

  private async renderJob(job: SceneRenderJob): Promise<void> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "storyteller-render-"));
    const sourcePath = job.input.rendererId === "collage" ? undefined
      : join(temporaryDirectory, `source${safeExtension(job.input.material.name)}`);
    const file = sceneRenderFileType(job.input);
    const outputPath = join(temporaryDirectory, `scene.${file.extension}`);
    const visualOutputPath = job.input.artifact === "scene-frame" ? join(temporaryDirectory, "base.mp4") : outputPath;
    // A worker whose lease expires must never overwrite/delete another attempt's result.
    const storageKey = sceneRenderStorageKey(job, randomUUID());
    let uploaded = false;
    let stage: "download" | "render" | "upload" | "complete" = "download";
    const progress = createRenderProgressReporter(this.queue, job.id, this.workerId, job.progressPercent ?? 1);
    this.logger.info("scene render started", renderLogDetails(job));
    try {
      const input = job.input;
      const frame = input.artifact === "scene-frame" ? input.frame : undefined;
      if (input.artifact === "scene-frame" && (!frame || frame.layerPolicy !== "base-visual" || frame.format !== "png"
        || frame.intermediateCodec !== "h264-lossless")) throw new Error("scene frame manifest is incomplete");
      const prepareCollageSource = async (
        material: Extract<typeof input, { readonly rendererId: "collage" }>["materials"][number], name: string,
      ) => {
        const path = join(temporaryDirectory, `${name}${safeExtension(material.name)}`);
        await pipeline(await this.storage.open(material.storageKey), createWriteStream(path, { flags: "wx" }));
        await verifySource(path, material.contentHash);
        return {
          id: material.id,
          kind: material.kind,
          sourcePath: path,
          sourceSize: {
            width: material.sourceWidth ?? material.width,
            height: material.sourceHeight ?? material.height,
          },
          displaySize: { width: material.width, height: material.height },
          ...(material.sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds: material.sourceDurationSeconds }),
          ...(material.edit ? { edit: material.edit } : {}),
        };
      };
      const collageSources = input.rendererId === "collage" ? await Promise.all(input.materials.map(
        (material, index) => prepareCollageSource(material, `source-${index}`),
      )) : undefined;
      const backgroundInput = input.rendererId === "collage" ? input.background : undefined;
      const collageBackground = backgroundInput?.source === "previous-scene-frame"
        ? await (async () => {
            const path = join(temporaryDirectory, "background.png");
            await pipeline(await this.storage.open(backgroundInput.storageKey), createWriteStream(path, { flags: "wx" }));
            await verifySource(path, backgroundInput.contentHash);
            return {
              treatment: backgroundInput.treatment,
              kind: "image" as const,
              sourcePath: path,
              sourceSize: { width: backgroundInput.width, height: backgroundInput.height },
            };
          })()
        : input.rendererId === "collage"
          ? await (async () => {
              const materialId = input.background && input.background.source !== "previous-scene-frame"
                ? input.background.materialId : input.materials[0]?.id;
              const cardSource = collageSources?.find(({ id }) => id === materialId);
              if (cardSource) return { ...cardSource, treatment: input.background?.treatment ?? "darkened" as const };
              const material = input.background && input.background.source !== "previous-scene-frame"
                ? input.background.material : undefined;
              const source = material ? await prepareCollageSource(material, "source-background") : undefined;
              return source ? { ...source, treatment: input.background?.treatment ?? "darkened" as const } : undefined;
            })()
          : undefined;
      const needsVideoSource = input.rendererId !== "collage" && (input.rendererId !== "video" || input.mode !== "audio" || !input.audio);
      if (needsVideoSource && sourcePath) {
        await pipeline(await this.storage.open(input.material.storageKey), createWriteStream(sourcePath, { flags: "wx" }));
        await verifySource(sourcePath, input.material.contentHash);
      }
      const audioPath = input.rendererId === "video" && input.mode !== "video" && input.audio
        ? join(temporaryDirectory, `audio${safeExtension(input.audio.name)}`) : undefined;
      if (audioPath && input.rendererId === "video" && input.audio) {
        await pipeline(await this.storage.open(input.audio.storageKey), createWriteStream(audioPath, { flags: "wx" }));
        await verifySource(audioPath, input.audio.contentHash);
      }
      stage = "render";
      await progress.reportAndWait(10, "rendering");
      const onRenderProgress = (value: number) => progress.report(10 + value * 78, "rendering");
      if (input.rendererId === "collage") {
        if (!collageSources) throw new Error("collage sources were not prepared");
        await this.renderPhotoCollage({
          ...(collageBackground ? { background: collageBackground } : {}),
          materials: collageSources,
          outputPath: visualOutputPath,
          layoutId: input.layoutId,
          layoutRendererId: input.layoutRendererId,
          layoutOverlapRatio: input.layoutOverlapRatio,
          settings: input.settings,
          durationSeconds: input.durationSeconds,
          width: input.output.width,
          height: input.output.height,
          fps: input.output.fps,
          ...(input.output.frameRate ? { frameRate: input.output.frameRate } : {}),
          ...(input.output.durationFrames ? { durationFrames: input.output.durationFrames } : {}),
          lossless: input.artifact === "scene-frame",
          overwrite: true,
          onProgress: onRenderProgress,
        });
      }
      else if (input.rendererId === "video") await this.renderMotionVideo({
        ...(needsVideoSource && sourcePath ? { sourcePath } : {}), ...(audioPath ? { audioPath } : {}), outputPath: visualOutputPath,
        sourceSize: { width: input.material.width, height: input.material.height },
        ...(input.sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds: input.sourceDurationSeconds }),
        hasAudio: input.hasAudio, mode: input.mode, edit: input.edit, lossless: input.artifact === "scene-frame",
        width: input.output.width, height: input.output.height,
        ...(input.output.frameRate ? { frameRate: input.output.frameRate } : {}),
        ...(input.output.durationFrames ? { durationFrames: input.output.durationFrames } : {}),
        onProgress: onRenderProgress,
      });
      else if (sourcePath) await this.render({
        sourcePath,
        outputPath: visualOutputPath,
        sourceSize: { width: input.material.width, height: input.material.height },
        orientation: input.material.orientation,
        durationSeconds: input.durationSeconds,
        motion: input.motion,
        focusPoint: input.focusPoint,
        width: input.output.width,
        height: input.output.height,
        fps: input.output.fps,
        ...(input.output.frameRate ? { frameRate: input.output.frameRate } : {}),
        ...(input.output.durationFrames ? { durationFrames: input.output.durationFrames } : {}),
        lossless: input.artifact === "scene-frame",
        overwrite: true,
        onProgress: onRenderProgress,
      });
      await progress.reportAndWait(90, "finalizing");
      if (frame) await this.renderFrame({ sourcePath: visualOutputPath, outputPath, compressionLevel: frame.compressionLevel });
      const output = await stat(outputPath);
      const contentHash = await hashFileContent(outputPath);
      stage = "upload";
      await progress.reportAndWait(94, "uploading");
      await this.storage.put(storageKey, {
        body: createReadStream(outputPath), contentType: file.mimeType, contentLength: output.size,
      });
      uploaded = true;
      stage = "complete";
      await progress.reportAndWait(99, "finalizing");
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

function createRenderProgressReporter(
  queue: SceneRenderQueue,
  renderId: string,
  workerId: string,
  initialPercent: number,
) {
  let lastPercent = Math.max(0, Math.min(99, Math.round(initialPercent)));
  let lastPhase: SceneRenderProgressPhase = "downloading";
  let pending = Promise.resolve();
  let failure: unknown;
  const report = (rawPercent: number, phase: SceneRenderProgressPhase) => {
    const percent = Math.max(lastPercent, Math.min(99, Math.round(rawPercent)));
    if (percent === lastPercent && phase === lastPhase) return;
    lastPercent = percent;
    lastPhase = phase;
    pending = pending.then(async () => {
      if (failure) return;
      if (!await queue.reportProgress(renderId, workerId, percent, phase)) throw new Error("scene render lease was lost");
    }).catch((error: unknown) => { failure ??= error; });
  };
  return {
    report,
    async reportAndWait(percent: number, phase: SceneRenderProgressPhase) {
      report(percent, phase);
      await pending;
      if (failure) throw failure;
    },
  };
}

function renderLogDetails(job: SceneRenderJob): Record<string, unknown> {
  if (job.input.rendererId === "collage") return {
    renderId: job.id,
    storyId: job.storyId,
    sceneId: job.sceneId,
    rendererId: job.input.rendererId,
    layoutId: job.input.layoutId,
    layoutRendererId: job.input.layoutRendererId,
    artifact: job.input.artifact ?? "scene-render",
    motion: "rotating-fly-in",
    durationSeconds: job.input.durationSeconds,
    materialCount: job.input.materials.length,
    outputWidth: job.input.output.width,
    outputHeight: job.input.output.height,
  };
  return {
    renderId: job.id,
    storyId: job.storyId,
    sceneId: job.sceneId,
    rendererId: job.input.rendererId,
    artifact: job.input.artifact ?? "scene-render",
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
