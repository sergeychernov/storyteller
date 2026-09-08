import { ApplicationError, type StoryApplication } from "@storyteller/application";
import { buildStoryTimeline, resolveSoundtrackMix, type Story } from "@storyteller/domain";
import {
  hashSceneRenderInput, type SoundtrackRenderQueue, type StoryExportJob, type StoryExportManifest, type StoryExportQueue,
} from "@storyteller/render-queue";
import { createHash, randomUUID } from "node:crypto";
import type { MediaStorage } from "./media-storage.js";
import {
  buildStoryExportAudioSegmentInput, buildStoryExportSegmentInput, sceneHasExportableAudio,
} from "./scene-render-input.js";

export class StoryExportService {
  constructor(
    private readonly application: StoryApplication,
    private readonly queue: StoryExportQueue,
    private readonly media: Pick<MediaStorage, "contentHash">,
    /** Explicitly required even when absent, so wiring the service cannot silently leave every master silent. */
    private readonly soundtracks: SoundtrackRenderQueue | undefined,
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
    // Asking for the master is the approval: whatever music the story has right now is what it carries.
    const soundtrack = await this.expectedSoundtrack(profileId, storyId, story);
    const inputs = await Promise.all(timeline.scenes.map(async (timelineScene) => {
      const scene = story.scenes[timelineScene.index];
      if (!scene) throw new ApplicationError("story timeline is inconsistent", 409, "story_export_timeline_mismatch");
      const input = await buildStoryExportSegmentInput(scene, timelineScene, timeline.frameRate, this.media);
      return {
        position: timelineScene.index, sceneId: timelineScene.sceneId, durationFrames: timelineScene.durationFrames,
        input, inputHash: hashSceneRenderInput(input),
      };
    }));
    const audioSegments = await Promise.all(timeline.scenes
      .map((timelineScene) => ({ timelineScene, scene: story.scenes[timelineScene.index] }))
      .filter(({ scene }) => scene && sceneHasExportableAudio(scene))
      .map(async ({ timelineScene, scene }) => {
        const input = await buildStoryExportAudioSegmentInput(scene!, timelineScene, timeline.frameRate, this.media);
        return {
          position: timelineScene.index, sceneId: timelineScene.sceneId, durationFrames: timelineScene.durationFrames,
          input, inputHash: hashSceneRenderInput(input),
        };
      }));
    const levels = resolveSoundtrackMix(story);
    const manifest: StoryExportManifest = {
      version: 2, storyRevision: story.revision, timelineHash, outputProfileId,
      frameRate: timeline.frameRate, totalFrames: timeline.totalFrames,
      ...(soundtrack ? { soundtrack } : {}),
      levels: { video: levels.video, rhythm: levels.rhythm, melody: levels.melody, duckedMelody: levels.duckedMelody },
      segments: inputs, audioSegments,
    };
    const queued = await this.queue.enqueue({
      id: randomUUID(), profileId, storyId, manifest, manifestHash: hashValue(manifest),
    });
    if (!queued) throw new ApplicationError("story changed while export was queued", 409, "story_revision_conflict");
    return queued;
  }

  /** Only a ready render of this exact timeline qualifies; anything else leaves the master silent rather than wrong. */
  private async expectedSoundtrack(
    profileId: string, storyId: string, story: Story,
  ): Promise<StoryExportManifest["soundtrack"]> {
    const job = await this.soundtracks?.findCurrentAuthorized(profileId, storyId);
    if (!job || job.status !== "ready" || !job.rhythmStem || !job.melodyStem) return undefined;
    const timeline = buildStoryTimeline(story);
    if (job.input.totalFrames !== timeline.totalFrames
      || job.input.frameRate.numerator !== timeline.frameRate.numerator
      || job.input.frameRate.denominator !== timeline.frameRate.denominator) return undefined;
    return {
      renderId: job.id,
      rhythm: { storageKey: job.rhythmStem.storageKey, contentHash: job.rhythmStem.contentHash },
      melody: { storageKey: job.melodyStem.storageKey, contentHash: job.melodyStem.contentHash },
    };
  }

  /**
   * A master is current only while it still matches the story it was built from — including its music. Changing a
   * level or asking for another melody moves neither the story revision nor the timeline, so comparing revisions
   * alone would keep offering a master with the previous soundtrack.
   */
  private async describe(profileId: string, storyId: string, job: StoryExportJob): Promise<StoryExportView> {
    const story = await this.application.getStory(profileId, storyId);
    const expected = await this.expectedSoundtrack(profileId, storyId, story);
    const current = job.manifest.storyRevision === story.revision
      && hashValue(job.manifest.soundtrack ?? null) === hashValue(expected ?? null)
      && hashValue(job.manifest.levels) === hashValue(resolveSoundtrackMix(story));
    return { job, currentRevision: story.revision, current };
  }

  async current(profileId: string, storyId: string): Promise<StoryExportView> {
    const job = await this.queue.findCurrentAuthorized(profileId, storyId);
    if (!job) throw new ApplicationError("story export not found", 404, "story_export_not_found");
    return this.describe(profileId, storyId, job);
  }

  async get(profileId: string, storyId: string, exportId: string): Promise<StoryExportView> {
    const job = await this.queue.findAuthorized(profileId, storyId, exportId);
    if (!job) throw new ApplicationError("story export not found", 404, "story_export_not_found");
    return this.describe(profileId, storyId, job);
  }
}

export interface StoryExportView {
  readonly job: StoryExportJob;
  readonly currentRevision: number;
  readonly current: boolean;
}

export function serializeStoryExport(value: StoryExportView) {
  const { job, currentRevision, current } = value;
  return {
    id: job.id, status: job.status, current, currentRevision, storyRevision: job.manifest.storyRevision,
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
