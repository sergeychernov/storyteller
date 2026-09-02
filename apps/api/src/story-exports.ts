import { ApplicationError, type StoryApplication } from "@storyteller/application";
import { buildStoryTimeline, type Story } from "@storyteller/domain";
import {
  hashSceneRenderInput, type StoryExportJob, type StoryExportManifest, type StoryExportQueue,
} from "@storyteller/render-queue";
import { createHash, randomUUID } from "node:crypto";
import type { MediaStorage } from "./media-storage.js";
import { buildStoryExportSegmentInput } from "./scene-render-input.js";

export class StoryExportService {
  constructor(
    private readonly application: StoryApplication,
    private readonly queue: StoryExportQueue,
    private readonly media: Pick<MediaStorage, "contentHash">,
  ) {}

  async request(profileId: string, storyId: string, expectedRevision: number, outputProfileId: string): Promise<StoryExportJob> {
    if (outputProfileId !== "vertical-social-v1") {
      throw new ApplicationError("unsupported story output profile", 422, "story_export_profile_unsupported");
    }
    const story = await this.application.getStory(profileId, storyId);
    if (story.revision !== expectedRevision) {
      throw new ApplicationError("story has changed; reload it before exporting", 409, "story_revision_conflict");
    }
    const timeline = buildStoryTimeline(story);
    const empty = timeline.warnings[0];
    if (empty) {
      const position = timeline.scenes.find(({ sceneId }) => sceneId === empty.sceneId)?.index ?? 0;
      throw new ApplicationError(`scene ${position + 1} is empty`, 422, "story_export_empty_scene");
    }
    if (!timeline.scenes.length) throw new ApplicationError("story has no scenes", 422, "story_export_empty_story");
    const timelineHash = hashTimeline(story, timeline);
    const mix = story.approvedMix;
    if (!mix) {
      throw new ApplicationError("approve the final audio mix before exporting", 409, "story_export_approved_mix_required");
    }
    if (mix.timelineHash !== timelineHash || mix.durationFrames !== timeline.totalFrames) {
      throw new ApplicationError("approved mix belongs to another story timeline", 409, "story_export_approved_mix_stale");
    }
    const inputs = await Promise.all(timeline.scenes.map(async (timelineScene) => {
      const scene = story.scenes[timelineScene.index];
      if (!scene) throw new ApplicationError("story timeline is inconsistent", 409, "story_export_timeline_mismatch");
      const input = await buildStoryExportSegmentInput(scene, timelineScene, timeline.frameRate, this.media);
      return {
        position: timelineScene.index, sceneId: timelineScene.sceneId, durationFrames: timelineScene.durationFrames,
        input, inputHash: hashSceneRenderInput(input),
      };
    }));
    const manifest: StoryExportManifest = {
      version: 1, storyRevision: story.revision, timelineHash, outputProfileId,
      frameRate: timeline.frameRate, totalFrames: timeline.totalFrames,
      approvedMix: { storageKey: mix.storageKey, contentHash: mix.contentHash, durationFrames: mix.durationFrames },
      segments: inputs,
    };
    const queued = await this.queue.enqueue({
      id: randomUUID(), profileId, storyId, manifest, manifestHash: hashValue(manifest),
    });
    if (!queued) throw new ApplicationError("story changed while export was queued", 409, "story_revision_conflict");
    return queued;
  }

  async current(profileId: string, storyId: string): Promise<{ readonly job: StoryExportJob; readonly currentRevision: number }> {
    const story = await this.application.getStory(profileId, storyId);
    const job = await this.queue.findCurrentAuthorized(profileId, storyId);
    if (!job) throw new ApplicationError("story export not found", 404, "story_export_not_found");
    return { job, currentRevision: story.revision };
  }

  async get(profileId: string, storyId: string, exportId: string): Promise<{ readonly job: StoryExportJob; readonly currentRevision: number }> {
    const story = await this.application.getStory(profileId, storyId);
    const job = await this.queue.findAuthorized(profileId, storyId, exportId);
    if (!job) throw new ApplicationError("story export not found", 404, "story_export_not_found");
    return { job, currentRevision: story.revision };
  }
}

export function serializeStoryExport(value: { readonly job: StoryExportJob; readonly currentRevision: number }) {
  const { job, currentRevision } = value;
  return {
    id: job.id, status: job.status, currentRevision, storyRevision: job.manifest.storyRevision,
    outputProfileId: job.manifest.outputProfileId, frameRate: job.manifest.frameRate, totalFrames: job.manifest.totalFrames,
    progressPercent: job.progressPercent, progressPhase: job.progressPhase,
    readySegments: job.readySegments, totalSegments: job.totalSegments,
    ...(job.sizeBytes === undefined ? {} : { sizeBytes: job.sizeBytes }),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
  };
}

export function hashTimeline(story: Story, timeline = buildStoryTimeline(story)): string {
  return hashValue({
    revision: timeline.revision, sceneOrder: timeline.sceneOrder, frameRate: timeline.frameRate, totalFrames: timeline.totalFrames,
    scenes: timeline.scenes.map(({ sceneId, materialIds, startFrame, endFrame, durationFrames }) => ({
      sceneId, materialIds, startFrame, endFrame, durationFrames,
    })),
  });
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
