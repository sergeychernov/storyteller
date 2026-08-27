import { randomUUID } from "node:crypto";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import { centeredFocusPoint, getMaterialPresentation, getMaterialSource, type VideoExportMode } from "@storyteller/domain";
import { hashSceneRenderInput, type SceneRenderInput, type SceneRenderJob, type SceneRenderQueue } from "@storyteller/render-queue";
import { stillImageRendererVersion, videoRendererVersion } from "@storyteller/renderer";

export class SceneRenderService {
  constructor(private readonly application: StoryApplication, private readonly queue: SceneRenderQueue) {}

  async request(profileId: string, storyId: string, sceneId: string, mode?: VideoExportMode): Promise<SceneRenderJob> {
    const story = await this.application.getStory(profileId, storyId);
    const scene = story.scenes.find(({ id }) => id === sceneId);
    if (!scene) throw new ApplicationError(`scene not found: ${sceneId}`, 404);
    const material = scene.materials[0];
    if (scene.materials.length !== 1 || !material || (material.kind === "image" && scene.rendererId !== "still-image")) {
      throw new ApplicationError("scene rendering is available only for one image or video", 422, "unsupported_scene_renderer");
    }
    if (mode === "audio" && (material.kind !== "video" || !material.hasAudio)) {
      throw new ApplicationError("this scene has no audio track", 422, "missing_audio_track");
    }
    const presentation = getMaterialPresentation(material);
    const source = material.kind === "video" ? getMaterialSource(material) : presentation;
    const common = {
      material: {
        storageKey: source.storageKey,
        name: source.storageKey,
        mimeType: source.mimeType,
        width: source.width,
        height: source.height,
        orientation: source.orientation,
      },
      durationSeconds: scene.durationSeconds,
      motion: scene.motion,
      focusPoint: scene.focusPoint ?? centeredFocusPoint,
      output: { width: 1080, height: 1920, fps: 30, codec: "h264" as const },
    };
    const sourceDurationSeconds = material.kind === "video" ? material.sourceDurationSeconds ?? material.videoTrack?.durationSeconds : undefined;
    const input: SceneRenderInput = material.kind === "video" ? {
      ...common, rendererId: "video", rendererVersion: videoRendererVersion, mode: mode ?? "combined",
      hasAudio: material.hasAudio,
      edit: { rotation: material.edit?.rotation ?? 0, crop: material.edit?.crop ?? { x: 0, y: 0, width: 1, height: 1 },
        ...(material.edit?.trim ? { trim: material.edit.trim } : {}) },
      ...(sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds }),
      ...(material.audioTrack ? { audio: {
        storageKey: material.audioTrack.storageKey, name: material.audioTrack.storageKey, mimeType: material.audioTrack.mimeType,
      } } : {}),
      durationSeconds: presentation.durationSeconds ?? sourceDurationSeconds ?? scene.durationSeconds,
      output: { ...common.output, width: presentation.width, height: presentation.height },
    } : { ...common, rendererId: "still-image", rendererVersion: stillImageRendererVersion };
    return this.queue.enqueue({
      id: randomUUID(), profileId, storyId, sceneId, input, inputHash: hashSceneRenderInput(input),
    });
  }

  async get(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob> {
    const job = await this.queue.findAuthorized(profileId, storyId, sceneId, renderId);
    if (!job) throw new ApplicationError(`scene render not found: ${renderId}`, 404);
    return job;
  }
}

export function serializeSceneRender(job: SceneRenderJob) {
  return {
    id: job.id,
    status: job.status,
    ...(job.sizeBytes === undefined ? {} : { sizeBytes: job.sizeBytes }),
    ...(job.error === undefined ? {} : { error: job.error }),
  };
}
