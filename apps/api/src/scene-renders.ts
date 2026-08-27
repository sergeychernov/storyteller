import { randomUUID } from "node:crypto";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import { centeredFocusPoint, getMaterialPresentation } from "@storyteller/domain";
import { hashSceneRenderInput, type SceneRenderJob, type SceneRenderQueue } from "@storyteller/render-queue";
import { stillImageRendererVersion } from "@storyteller/renderer";

export class SceneRenderService {
  constructor(private readonly application: StoryApplication, private readonly queue: SceneRenderQueue) {}

  async request(profileId: string, storyId: string, sceneId: string): Promise<SceneRenderJob> {
    const story = await this.application.getStory(profileId, storyId);
    const scene = story.scenes.find(({ id }) => id === sceneId);
    if (!scene) throw new ApplicationError(`scene not found: ${sceneId}`, 404);
    const material = scene.materials[0];
    if (scene.rendererId !== "still-image" || scene.materials.length !== 1 || material?.kind !== "image") {
      throw new ApplicationError("scene rendering is currently available only for one image", 422, "unsupported_scene_renderer");
    }
    const presentation = getMaterialPresentation(material);
    const input = {
      rendererId: "still-image" as const,
      rendererVersion: stillImageRendererVersion,
      material: {
        storageKey: presentation.storageKey,
        name: material.edit ? presentation.storageKey : material.name,
        mimeType: presentation.mimeType,
        width: presentation.width,
        height: presentation.height,
        orientation: presentation.orientation,
      },
      durationSeconds: scene.durationSeconds,
      motion: scene.motion,
      focusPoint: scene.focusPoint ?? centeredFocusPoint,
      output: { width: 1080, height: 1920, fps: 30, codec: "h264" as const },
    };
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
