import { createHash, randomUUID } from "node:crypto";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import type { SoundtrackRenderJob, SoundtrackRenderQueue } from "@storyteller/render-queue";
import {
  getSoundtrackPreset, maximumMelodyVariant, maximumSoundtrackDurationSeconds, soundtrackEngineId, soundtrackEngineVersion,
  soundtrackPresets, soundtrackSampleRate, type SoundtrackPresetId, type SoundtrackPresetSummary,
  type SoundtrackStemId,
} from "@storyteller/soundtrack";

export class SoundtrackService {
  constructor(private readonly application: StoryApplication, private readonly queue: SoundtrackRenderQueue) {}

  listPresets(): SoundtrackPresetSummary[] {
    return soundtrackPresets.map(({ id, version, bpm, default: selected }) => ({ id, version, bpm, default: selected }));
  }

  async request(profileId: string, storyId: string, expectedRevision: number, presetId: SoundtrackPresetId, melodyVariant = 0) {
    const story = await this.application.getStory(profileId, storyId);
    if (story.revision !== expectedRevision) {
      throw new ApplicationError("story has changed; reload it before creating music", 409, "story_revision_conflict");
    }
    const timeline = await this.application.getStoryTimeline(profileId, storyId);
    const durationSeconds = timeline.totalFrames * timeline.frameRate.denominator / timeline.frameRate.numerator;
    if (timeline.totalFrames <= 0 || durationSeconds <= 0) {
      throw new ApplicationError("the story needs playable material before music can be created", 422, "soundtrack_empty_story");
    }
    if (durationSeconds > maximumSoundtrackDurationSeconds + 1e-9) {
      throw new ApplicationError("built-in music is limited to three minutes", 422, "soundtrack_duration_limit_exceeded");
    }
    const preset = getSoundtrackPreset(presetId);
    if (!preset) throw new ApplicationError("soundtrack preset is unavailable", 422, "soundtrack_preset_unavailable");
    if (!Number.isSafeInteger(melodyVariant) || melodyVariant < 0 || melodyVariant > maximumMelodyVariant) {
      throw new ApplicationError("that many melodies are not available", 422, "soundtrack_melody_variant_unavailable");
    }
    const totalSampleFrames = Math.round(durationSeconds * soundtrackSampleRate);
    const seed = digest(`storyteller-soundtrack-seed-v1:${storyId}:${totalSampleFrames}:${preset.id}:${preset.version}`);
    const hashInput = {
      storyId, frameRate: timeline.frameRate, totalFrames: timeline.totalFrames, totalSampleFrames,
      presetId: preset.id, presetVersion: preset.version, engineId: soundtrackEngineId, engineVersion: soundtrackEngineVersion,
      melodyVariant,
    };
    const inputHash = digest(JSON.stringify(hashInput));
    const job = await this.queue.enqueue({
      id: randomUUID(), profileId, storyId, inputHash,
      input: {
        version: 1, storyRevision: story.revision, frameRate: timeline.frameRate, totalFrames: timeline.totalFrames,
        totalSampleFrames, presetId: preset.id, presetVersion: preset.version,
        engineId: soundtrackEngineId, engineVersion: soundtrackEngineVersion, seed, melodyVariant,
      },
    }, expectedRevision);
    if (!job) throw new ApplicationError("story has changed; reload it before creating music", 409, "story_revision_conflict");
    return serializeSoundtrackRender(job, story.revision, timeline);
  }

  async current(profileId: string, storyId: string) {
    const story = await this.application.getStory(profileId, storyId);
    const timeline = await this.application.getStoryTimeline(profileId, storyId);
    const job = await this.queue.findCurrentAuthorized(profileId, storyId);
    if (!job) throw new ApplicationError("soundtrack render not found", 404, "soundtrack_not_found");
    return serializeSoundtrackRender(job, story.revision, timeline);
  }

  async get(profileId: string, storyId: string, renderId: string) {
    const story = await this.application.getStory(profileId, storyId);
    const timeline = await this.application.getStoryTimeline(profileId, storyId);
    const job = await this.queue.findAuthorized(profileId, storyId, renderId);
    if (!job) throw new ApplicationError("soundtrack render not found", 404, "soundtrack_not_found");
    return { job, serialized: serializeSoundtrackRender(job, story.revision, timeline) };
  }
}

export function serializeSoundtrackRender(
  job: SoundtrackRenderJob,
  currentRevision: number,
  timeline: { readonly totalFrames: number; readonly frameRate: { readonly numerator: number; readonly denominator: number } },
) {
  const preset = getSoundtrackPreset(job.input.presetId);
  if (!preset || preset.version !== job.input.presetVersion) throw new Error("stored soundtrack preset is unavailable");
  const stems = (["rhythm", "melody"] as const).filter((stem) => soundtrackStemArtifact(job, stem));
  const current = job.input.totalFrames === timeline.totalFrames
    && job.input.frameRate.numerator === timeline.frameRate.numerator
    && job.input.frameRate.denominator === timeline.frameRate.denominator;
  return {
    id: job.id, status: job.status, progressPercent: job.progressPercent, progressPhase: job.progressPhase,
    current, currentRevision, storyRevision: job.input.storyRevision, inputHash: job.inputHash,
    preset: { id: preset.id, version: preset.version, bpm: preset.bpm, default: preset.default },
    frameRate: job.input.frameRate, totalFrames: job.input.totalFrames, totalSampleFrames: job.input.totalSampleFrames,
    melodyVariant: job.input.melodyVariant,
    createdAt: job.createdAt, ...(job.preview ? { sizeBytes: job.preview.sizeBytes, contentHash: job.preview.contentHash } : {}),
    ...(stems.length ? { stems } : {}), ...(job.error ? { error: job.error } : {}),
  };
}

/** Playable AAC derivatives of the lossless stems, used by the web mixer to balance rhythm against melody. */
export function soundtrackStemArtifact(job: SoundtrackRenderJob, stem: SoundtrackStemId) {
  return stem === "rhythm" ? job.rhythmPreview : job.melodyPreview;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
