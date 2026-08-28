import { randomUUID } from "node:crypto";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import type { Scene, VideoExportMode } from "@storyteller/domain";
import { hashSceneRenderInput, sceneRenderParameters, type SceneRenderJob, type SceneRenderQueue } from "@storyteller/render-queue";
import type { MediaStorage } from "./media-storage.js";
import { buildSceneRenderInput } from "./scene-render-input.js";

export interface VersionedSceneRender extends SceneRenderJob { readonly current: boolean }

export class SceneRenderService {
  constructor(private readonly application: StoryApplication, private readonly queue: SceneRenderQueue, private readonly media: MediaStorage) {}

  async request(profileId: string, storyId: string, sceneId: string, mode?: VideoExportMode): Promise<VersionedSceneRender> {
    const story = await this.application.getStory(profileId, storyId);
    const input = await buildSceneRenderInput(findScene(story.scenes, sceneId), this.media, mode);
    const job = await this.queue.enqueue({
      id: randomUUID(), profileId, storyId, sceneId, input, inputHash: hashSceneRenderInput(input),
    }, story.revision);
    if (!job) {
      findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
      throw new ApplicationError("story changed before rendering; reload and try again", 409, "story_revision_conflict");
    }
    // A queued snapshot may already be obsolete by the time the request finishes.
    return this.get(profileId, storyId, sceneId, job.id);
  }

  async list(profileId: string, storyId: string, sceneId: string): Promise<readonly VersionedSceneRender[]> {
    const scene = findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
    const jobs = await this.queue.listAuthorized(profileId, storyId, sceneId);
    const versions = new Map<string, Promise<string | undefined>>();
    return Promise.all(jobs.map(async (job) => {
      const mode = job.input.rendererId === "video" ? job.input.mode : undefined;
      const key = mode ?? "image";
      if (!versions.has(key)) versions.set(key, this.currentHash(scene, mode));
      return { ...job, current: isCurrent(job, await versions.get(key)!) };
    }));
  }

  async get(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<VersionedSceneRender> {
    const scene = findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
    const job = await this.queue.findAuthorized(profileId, storyId, sceneId, renderId);
    if (!job) throw new ApplicationError(`scene render not found: ${renderId}`, 404);
    const hash = await this.currentHash(scene, job.input.rendererId === "video" ? job.input.mode : undefined);
    return { ...job, current: isCurrent(job, hash) };
  }

  private async currentHash(scene: Scene, mode?: VideoExportMode): Promise<string | undefined> {
    try { return hashSceneRenderInput(await buildSceneRenderInput(scene, this.media, mode)); }
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
  return {
    id: job.id, status: job.status, current: job.current, inputHash: job.inputHash,
    mode: job.input.rendererId === "video" ? job.input.mode : "video" as const,
    parameters: sceneRenderParameters(job.input),
    dependencies: (job.input.dependencies ?? []).map((dependency) => ({ ...dependency, parents: [...dependency.parents] })),
    ...(job.contentHash === undefined ? {} : { contentHash: job.contentHash }),
    ...(job.createdAt === undefined ? {} : { createdAt: job.createdAt }),
    ...(job.sizeBytes === undefined ? {} : { sizeBytes: job.sizeBytes }),
    ...(job.error === undefined ? {} : { error: job.error }),
  };
}
