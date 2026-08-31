import { randomUUID } from "node:crypto";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import type { Scene, Story, VideoExportMode } from "@storyteller/domain";
import {
  hashSceneRenderInput, isSceneFrameInput, sceneRenderParameters, type SceneRenderInput, type SceneRenderJob, type SceneRenderQueue,
} from "@storyteller/render-queue";
import type { MediaStorage } from "./media-storage.js";
import {
  buildSceneFrameInput, buildSceneRenderInput, type CollageBackgroundFrame,
} from "./scene-render-input.js";

export interface SceneRenderResult extends SceneRenderJob { readonly current: boolean }

export class SceneRenderService {
  constructor(private readonly application: StoryApplication, private readonly queue: SceneRenderQueue, private readonly media: MediaStorage) {}

  async request(profileId: string, storyId: string, sceneId: string, mode?: VideoExportMode): Promise<SceneRenderResult> {
    return this.requestInput(profileId, storyId, sceneId,
      (scene, background) => buildSceneRenderInput(scene, this.media, mode, background));
  }

  async requestFrame(profileId: string, storyId: string, sceneId: string): Promise<SceneRenderResult> {
    return this.requestInput(profileId, storyId, sceneId,
      (scene, background) => buildSceneFrameInput(scene, this.media, background));
  }

  private async requestInput(
    profileId: string,
    storyId: string,
    sceneId: string,
    build: (scene: Scene, background?: CollageBackgroundFrame) => Promise<SceneRenderInput>,
  ): Promise<SceneRenderResult> {
    const story = await this.application.getStory(profileId, storyId);
    const sceneIndex = findSceneIndex(story.scenes, sceneId);
    const scene = story.scenes[sceneIndex]!;
    const input = await build(scene, scene.collageBackground?.source === "material"
      ? undefined
      : await this.readyPreviousFrame(profileId, story, sceneIndex));
    const job = await this.queue.enqueue({
      id: randomUUID(), profileId, storyId, sceneId, input, inputHash: hashSceneRenderInput(input),
    }, story.revision);
    if (!job) {
      findScene((await this.application.getStory(profileId, storyId)).scenes, sceneId);
      throw new ApplicationError("story changed before rendering; reload and try again", 409, "story_revision_conflict");
    }
    // A queued snapshot may already be obsolete by the time the request finishes.
    return this.getResult(profileId, storyId, sceneId, job.id, isSceneFrameInput(input));
  }

  async list(profileId: string, storyId: string, sceneId: string): Promise<readonly SceneRenderResult[]> {
    const story = await this.application.getStory(profileId, storyId);
    const scene = findScene(story.scenes, sceneId);
    const jobs = (await this.queue.listAuthorized(profileId, storyId, sceneId)).filter((job) => !isSceneFrameInput(job.input));
    const currentHashes = new Map<string, Promise<string | undefined>>();
    return Promise.all(jobs.map(async (job) => {
      const mode = job.input.rendererId === "video" ? job.input.mode : undefined;
      const key = mode ?? "image";
      if (!currentHashes.has(key)) currentHashes.set(key, this.currentHash(profileId, story, scene, job.input));
      return { ...job, current: isCurrent(job, await currentHashes.get(key)!) };
    }));
  }

  async get(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderResult> {
    return this.getResult(profileId, storyId, sceneId, renderId, false);
  }

  async getFrame(profileId: string, storyId: string, sceneId: string, frameId: string): Promise<SceneRenderResult> {
    return this.getResult(profileId, storyId, sceneId, frameId, true);
  }

  private async getResult(profileId: string, storyId: string, sceneId: string, renderId: string, frame: boolean): Promise<SceneRenderResult> {
    const story = await this.application.getStory(profileId, storyId);
    const scene = findScene(story.scenes, sceneId);
    const job = await this.queue.findAuthorized(profileId, storyId, sceneId, renderId);
    if (!job || isSceneFrameInput(job.input) !== frame) throw new ApplicationError(`scene ${frame ? "frame" : "render"} not found: ${renderId}`, 404);
    const hash = await this.currentHash(profileId, story, scene, job.input);
    return { ...job, current: isCurrent(job, hash) };
  }

  private async currentHash(profileId: string, story: Story, scene: Scene, input: SceneRenderInput): Promise<string | undefined> {
    try {
      let background: CollageBackgroundFrame | undefined;
      if (input.rendererId === "collage" && input.background?.source === "previous-scene-frame") {
        const sceneIndex = findSceneIndex(story.scenes, scene.id);
        const previous = story.scenes[sceneIndex - 1];
        if (!previous || previous.id !== input.background.sceneId) return undefined;
        const previousInput = await buildSceneFrameInput(
          previous,
          this.media,
          await this.readyPreviousFrame(profileId, story, sceneIndex - 1),
        );
        if (hashSceneRenderInput(previousInput) !== input.background.inputHash) return undefined;
        background = input.background;
      }
      const current = isSceneFrameInput(input)
        ? await buildSceneFrameInput(scene, this.media, background)
        : await buildSceneRenderInput(
            scene,
            this.media,
            input.rendererId === "video" ? input.mode : undefined,
            background,
          );
      return hashSceneRenderInput(current);
    }
    catch (error) {
      // Adding/removing a material can make a previously supported scene unrenderable.
      if (error instanceof ApplicationError && error.statusCode === 422) return undefined;
      throw error;
    }
  }

  /** Selects only a ready frame matching the previous scene's best currently reproducible recipe. */
  private async readyPreviousFrame(
    profileId: string,
    story: Story,
    sceneIndex: number,
  ): Promise<CollageBackgroundFrame | undefined> {
    if (sceneIndex <= 0) return undefined;
    const previousIndex = sceneIndex - 1;
    const previous = story.scenes[previousIndex]!;
    try {
      const background = await this.readyPreviousFrame(profileId, story, previousIndex);
      const input = await buildSceneFrameInput(previous, this.media, background);
      const inputHash = hashSceneRenderInput(input);
      return (await this.queue.listAuthorized(profileId, story.id, previous.id)).find((job) =>
        isSceneFrameInput(job.input)
        && job.inputHash === inputHash
        && job.status === "ready"
        && Boolean(job.storageKey)
        && Boolean(job.contentHash));
    } catch (error) {
      if (error instanceof ApplicationError && error.statusCode === 422) return undefined;
      throw error;
    }
  }
}

function findScene(scenes: readonly Scene[], sceneId: string): Scene {
  return scenes[findSceneIndex(scenes, sceneId)]!;
}

function findSceneIndex(scenes: readonly Scene[], sceneId: string): number {
  const index = scenes.findIndex(({ id }) => id === sceneId);
  if (index < 0) throw new ApplicationError(`scene not found: ${sceneId}`, 404, "scene_not_found");
  return index;
}

function isCurrent(job: SceneRenderJob, hash: string | undefined): boolean {
  return job.inputHash === hash && (job.status !== "ready" || Boolean(job.contentHash));
}

export function serializeSceneRender(job: SceneRenderResult) {
  const frame = isSceneFrameInput(job.input);
  return {
    id: job.id, status: job.status, current: job.current, inputHash: job.inputHash,
    progressPercent: job.status === "ready" ? 100 : job.progressPercent ?? 0,
    progressPhase: job.status === "ready" ? "ready" as const : job.progressPhase ?? "queued" as const,
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
