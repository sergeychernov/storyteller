import { randomUUID } from "node:crypto";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import type { Scene, VideoExportMode } from "@storyteller/domain";
import {
  hashSceneRenderInput, isSceneFrameInput, sceneRenderParameters, type SceneRenderInput, type SceneRenderJob, type SceneRenderQueue,
} from "@storyteller/render-queue";
import type { MediaStorage } from "./media-storage.js";
import { buildSceneFrameInput, buildSceneRenderInput } from "./scene-render-input.js";

export interface VersionedSceneRender extends SceneRenderJob { readonly current: boolean }

export class SceneRenderService {
  constructor(private readonly application: StoryApplication, private readonly queue: SceneRenderQueue, private readonly media: MediaStorage) {}

  async request(profileId: string, storyId: string, sceneId: string, mode?: VideoExportMode): Promise<VersionedSceneRender> {
    return this.requestInput(profileId, storyId, sceneId, (scene) => buildSceneRenderInput(scene, this.media, mode));
  }

  async requestFrame(profileId: string, storyId: string, sceneId: string): Promise<VersionedSceneRender> {
    return this.requestInput(profileId, storyId, sceneId, (scene) => buildSceneFrameInput(scene, this.media));
  }

  private async requestInput(
    profileId: string,
    storyId: string,
    sceneId: string,
    build: (scene: Scene) => Promise<SceneRenderInput>,
  ): Promise<VersionedSceneRender> {
    const story = await this.application.getStory(profileId, storyId);
    const input = await build(findScene(story.scenes, sceneId));
    const job = await this.queue.enqueue({
      id: randomUUID(), profileId, storyId, sceneId, input, inputHash: hashSceneRenderInput(input),
    }, story.revision);
    if (!job) {
      findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
      throw new ApplicationError("story changed before rendering; reload and try again", 409, "story_revision_conflict");
    }
    // A queued snapshot may already be obsolete by the time the request finishes.
    return this.getVersion(profileId, storyId, sceneId, job.id, isSceneFrameInput(input));
  }

  async list(profileId: string, storyId: string, sceneId: string): Promise<readonly VersionedSceneRender[]> {
    const scene = findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
    const jobs = (await this.queue.listAuthorized(profileId, storyId, sceneId)).filter((job) => !isSceneFrameInput(job.input));
    const versions = new Map<string, Promise<string | undefined>>();
    return Promise.all(jobs.map(async (job) => {
      const mode = job.input.rendererId === "video" ? job.input.mode : undefined;
      const key = mode ?? "image";
      if (!versions.has(key)) versions.set(key, this.currentHash(scene, job.input));
      return { ...job, current: isCurrent(job, await versions.get(key)!) };
    }));
  }

  async get(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<VersionedSceneRender> {
    return this.getVersion(profileId, storyId, sceneId, renderId, false);
  }

  async getFrame(profileId: string, storyId: string, sceneId: string, frameId: string): Promise<VersionedSceneRender> {
    return this.getVersion(profileId, storyId, sceneId, frameId, true);
  }

  private async getVersion(profileId: string, storyId: string, sceneId: string, renderId: string, frame: boolean): Promise<VersionedSceneRender> {
    const scene = findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
    const job = await this.queue.findAuthorized(profileId, storyId, sceneId, renderId);
    if (!job || isSceneFrameInput(job.input) !== frame) throw new ApplicationError(`scene ${frame ? "frame" : "render"} not found: ${renderId}`, 404);
    const hash = await this.currentHash(scene, job.input);
    return { ...job, current: isCurrent(job, hash) };
  }

  private async currentHash(scene: Scene, input: SceneRenderInput): Promise<string | undefined> {
    try {
      const current = isSceneFrameInput(input)
        ? await buildSceneFrameInput(scene, this.media)
        : await buildSceneRenderInput(scene, this.media, input.rendererId === "video" ? input.mode : undefined);
      return hashSceneRenderInput(current);
    }
    catch (error) {
      // Adding/removing a material can make a previously supported scene unrenderable.
      if (error instanceof ApplicationError && error.statusCode === 422) return undefined;
      throw error;
    }
  }
}

function findScene(scenes: readonly Scene[], sceneId: string): Scene {
  const scene = scenes.find(({ id }) => id === sceneId);
  if (!scene) throw new ApplicationError(`scene not found: ${sceneId}`, 404, "scene_not_found");
  return scene;
}

function isCurrent(job: SceneRenderJob, hash: string | undefined): boolean {
  return job.inputHash === hash && (job.status !== "ready" || Boolean(job.contentHash));
}

export function serializeSceneRender(job: VersionedSceneRender) {
  const frame = isSceneFrameInput(job.input);
  return {
    id: job.id, status: job.status, current: job.current, inputHash: job.inputHash,
    artifact: frame ? "scene-frame" as const : "scene-render" as const,
    ...(frame ? {} : { mode: job.input.rendererId === "video" ? job.input.mode : "video" as const }),
    parameters: sceneRenderParameters(job.input),
    dependencies: (job.input.dependencies ?? []).map((dependency) => ({ ...dependency, parents: [...dependency.parents] })),
    ...(job.contentHash === undefined ? {} : { contentHash: job.contentHash }),
    ...(job.createdAt === undefined ? {} : { createdAt: job.createdAt }),
    ...(job.sizeBytes === undefined ? {} : { sizeBytes: job.sizeBytes }),
    ...(job.error === undefined ? {} : { error: job.error }),
  };
}
