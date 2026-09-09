import type { RationalFrameRate } from "@storyteller/domain";
import type { SoundtrackPresetId } from "@storyteller/soundtrack";
import type { Pool } from "pg";

export const soundtrackRenderStatuses = ["queued", "running", "ready", "failed"] as const;
export type SoundtrackRenderStatus = typeof soundtrackRenderStatuses[number];
export const soundtrackRenderPhases = ["queued", "synthesizing", "encoding", "verifying", "uploading", "ready"] as const;
export type SoundtrackRenderPhase = typeof soundtrackRenderPhases[number];

export interface SoundtrackRenderInput {
  readonly version: 1;
  readonly storyRevision: number;
  readonly frameRate: RationalFrameRate;
  readonly totalFrames: number;
  readonly totalSampleFrames: number;
  readonly presetId: SoundtrackPresetId;
  readonly presetVersion: 1;
  readonly engineId: "storyteller-procedural";
  readonly engineVersion: 5;
  readonly seed: string;
  readonly melodyVariant: number;
}

export interface SoundtrackArtifact {
  readonly storageKey: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly mimeType: "audio/mp4" | "audio/flac";
}

export interface SoundtrackProvenance {
  readonly origin: "storyteller_procedural";
  readonly engineId: "storyteller-procedural";
  readonly engineVersion: 5;
  readonly presetId: SoundtrackPresetId;
  readonly presetVersion: 1;
  readonly seed: string;
  readonly melodyVariant: number;
  readonly sampleRate: 48000;
  readonly channels: 2;
  readonly sampleFrames: number;
  readonly durationFrames: number;
  readonly frameRate: RationalFrameRate;
  readonly previewPcmSha256: string;
  readonly previewSha256: string;
  readonly rhythmStemSha256: string;
  readonly melodyStemSha256: string;
  readonly rhythmPreviewSha256: string;
  readonly melodyPreviewSha256: string;
  readonly externalAudioAssets: false;
  readonly licenseVersion: "storyteller-generated-music-1.0";
  readonly generatedAt: string;
}

export interface SoundtrackCompletion {
  readonly accepted: boolean;
  readonly supersededStorageKeys: readonly string[];
}

export interface SoundtrackArtifacts {
  readonly preview: SoundtrackArtifact;
  readonly rhythmStem: SoundtrackArtifact;
  readonly melodyStem: SoundtrackArtifact;
  readonly rhythmPreview: SoundtrackArtifact;
  readonly melodyPreview: SoundtrackArtifact;
}

export interface SoundtrackRenderJob {
  readonly id: string;
  readonly profileId: string;
  readonly storyId: string;
  readonly inputHash: string;
  readonly input: SoundtrackRenderInput;
  readonly status: SoundtrackRenderStatus;
  readonly progressPercent: number;
  readonly progressPhase: SoundtrackRenderPhase;
  readonly preview?: SoundtrackArtifact;
  readonly rhythmStem?: SoundtrackArtifact;
  readonly melodyStem?: SoundtrackArtifact;
  readonly rhythmPreview?: SoundtrackArtifact;
  readonly melodyPreview?: SoundtrackArtifact;
  readonly provenance?: SoundtrackProvenance;
  readonly createdAt: string;
  readonly error?: string;
}

export interface SoundtrackRenderQueue {
  enqueue(job: Pick<SoundtrackRenderJob, "id" | "profileId" | "storyId" | "inputHash" | "input">,
    expectedRevision: number): Promise<SoundtrackRenderJob | undefined>;
  findCurrentAuthorized(profileId: string, storyId: string): Promise<SoundtrackRenderJob | undefined>;
  findAuthorized(profileId: string, storyId: string, renderId: string): Promise<SoundtrackRenderJob | undefined>;
  claim(workerId: string, leaseMilliseconds: number): Promise<SoundtrackRenderJob | undefined>;
  reportProgress(renderId: string, workerId: string, progressPercent: number, phase: Exclude<SoundtrackRenderPhase, "queued" | "ready">): Promise<boolean>;
  /** Marks the render ready and drops the story's earlier soundtrack variants, returning their storage keys. */
  complete(renderId: string, workerId: string, artifacts: SoundtrackArtifacts, provenance: SoundtrackProvenance): Promise<SoundtrackCompletion>;
  fail(renderId: string, workerId: string, error: string): Promise<void>;
}

export class PostgresSoundtrackRenderQueue implements SoundtrackRenderQueue {
  constructor(private readonly pool: Pool) {}

  async enqueue(
    job: Pick<SoundtrackRenderJob, "id" | "profileId" | "storyId" | "inputHash" | "input">,
    expectedRevision: number,
  ): Promise<SoundtrackRenderJob | undefined> {
    const result = await this.pool.query<SoundtrackRow>(
      `WITH authorized_story AS (
         SELECT id FROM stories WHERE id = $3 AND profile_id = $2 AND revision = $7 FOR SHARE
       ), retained AS (
         INSERT INTO soundtrack_renders (id, profile_id, story_id, input_hash, input, story_revision, status)
         SELECT $1, $2, $3, $4, $5, $6, 'queued' FROM authorized_story
         ON CONFLICT (story_id, input_hash) DO UPDATE SET
           input = CASE WHEN soundtrack_renders.status = 'failed' THEN EXCLUDED.input ELSE soundtrack_renders.input END,
           story_revision = CASE WHEN soundtrack_renders.status = 'failed' THEN EXCLUDED.story_revision ELSE soundtrack_renders.story_revision END,
           status = CASE WHEN soundtrack_renders.status = 'failed' THEN 'queued' ELSE soundtrack_renders.status END,
           error = CASE WHEN soundtrack_renders.status = 'failed' THEN NULL ELSE soundtrack_renders.error END,
           attempts = CASE WHEN soundtrack_renders.status = 'failed' THEN 0 ELSE soundtrack_renders.attempts END,
           worker_id = CASE WHEN soundtrack_renders.status = 'failed' THEN NULL ELSE soundtrack_renders.worker_id END,
           locked_until = CASE WHEN soundtrack_renders.status = 'failed' THEN NULL ELSE soundtrack_renders.locked_until END,
           progress_percent = CASE WHEN soundtrack_renders.status = 'failed' THEN 0 ELSE soundtrack_renders.progress_percent END,
           progress_phase = CASE WHEN soundtrack_renders.status = 'failed' THEN 'queued' ELSE soundtrack_renders.progress_phase END,
           updated_at = now()
         RETURNING *
       ), activity AS (
         INSERT INTO product_activity_events (profile_id, code, dedupe_key)
         SELECT profile_id, 'story.soundtrack_requested', 'story.soundtrack_requested:' || id::text FROM retained
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
       ) SELECT * FROM retained`,
      [job.id, job.profileId, job.storyId, job.inputHash, job.input, job.input.storyRevision, expectedRevision],
    );
    return result.rows[0] && mapSoundtrackRow(result.rows[0]);
  }

  async findCurrentAuthorized(profileId: string, storyId: string): Promise<SoundtrackRenderJob | undefined> {
    const result = await this.pool.query<SoundtrackRow>(
      `SELECT * FROM soundtrack_renders WHERE profile_id = $1 AND story_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [profileId, storyId],
    );
    return result.rows[0] && mapSoundtrackRow(result.rows[0]);
  }

  async findAuthorized(profileId: string, storyId: string, renderId: string): Promise<SoundtrackRenderJob | undefined> {
    const result = await this.pool.query<SoundtrackRow>(
      `SELECT * FROM soundtrack_renders WHERE id = $1 AND profile_id = $2 AND story_id = $3`, [renderId, profileId, storyId],
    );
    return result.rows[0] && mapSoundtrackRow(result.rows[0]);
  }

  async claim(workerId: string, leaseMilliseconds: number): Promise<SoundtrackRenderJob | undefined> {
    const result = await this.pool.query<SoundtrackRow>(
      `WITH candidate AS (
         SELECT id FROM soundtrack_renders
         WHERE (status = 'queued' OR (status = 'running' AND locked_until < now())) AND attempts < 3
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE soundtrack_renders render SET status = 'running', worker_id = $1,
         progress_percent = GREATEST(progress_percent, 1), progress_phase = 'synthesizing',
         locked_until = now() + ($2 * interval '1 millisecond'), attempts = attempts + 1, updated_at = now()
       FROM candidate WHERE render.id = candidate.id RETURNING render.*`, [workerId, leaseMilliseconds],
    );
    return result.rows[0] && mapSoundtrackRow(result.rows[0]);
  }

  async reportProgress(
    renderId: string,
    workerId: string,
    progressPercent: number,
    phase: Exclude<SoundtrackRenderPhase, "queued" | "ready">,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE soundtrack_renders SET progress_percent = GREATEST(progress_percent, $3), progress_phase = $4, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'running'`,
      [renderId, workerId, Math.max(1, Math.min(99, Math.round(progressPercent))), phase],
    );
    return result.rowCount === 1;
  }

  async complete(
    renderId: string,
    workerId: string,
    artifacts: SoundtrackArtifacts,
    provenance: SoundtrackProvenance,
  ): Promise<SoundtrackCompletion> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const completed = await client.query<{ profile_id: string }>(
        `UPDATE soundtrack_renders SET status = 'ready', progress_percent = 100, progress_phase = 'ready',
           preview_storage_key = $3, preview_size_bytes = $4, preview_content_hash = $5,
           rhythm_storage_key = $6, rhythm_size_bytes = $7, rhythm_content_hash = $8,
           melody_storage_key = $9, melody_size_bytes = $10, melody_content_hash = $11,
           rhythm_preview_storage_key = $12, rhythm_preview_size_bytes = $13, rhythm_preview_content_hash = $14,
           melody_preview_storage_key = $15, melody_preview_size_bytes = $16, melody_preview_content_hash = $17,
           provenance = $18, error = NULL, worker_id = NULL, locked_until = NULL, updated_at = now()
         WHERE id = $1 AND worker_id = $2 AND status = 'running' RETURNING profile_id`,
        [renderId, workerId, artifacts.preview.storageKey, artifacts.preview.sizeBytes, artifacts.preview.contentHash,
          artifacts.rhythmStem.storageKey, artifacts.rhythmStem.sizeBytes, artifacts.rhythmStem.contentHash,
          artifacts.melodyStem.storageKey, artifacts.melodyStem.sizeBytes, artifacts.melodyStem.contentHash,
          artifacts.rhythmPreview.storageKey, artifacts.rhythmPreview.sizeBytes, artifacts.rhythmPreview.contentHash,
          artifacts.melodyPreview.storageKey, artifacts.melodyPreview.sizeBytes, artifacts.melodyPreview.contentHash, provenance],
      );
      const profileId = completed.rows[0]?.profile_id;
      if (!profileId) { await client.query("ROLLBACK"); return { accepted: false, supersededStorageKeys: [] }; }
      // Lock candidates before the DELETE statement takes its snapshot. An enqueue that
      // holds FOR SHARE must commit its manifest before we decide whether its stems are free.
      await client.query(
        `SELECT superseded.id FROM soundtrack_renders superseded, soundtrack_renders kept
         WHERE kept.id = $1 AND superseded.story_id = kept.story_id AND superseded.id <> kept.id
           AND superseded.created_at <= kept.created_at ORDER BY superseded.id FOR UPDATE OF superseded`, [renderId]);
      const superseded = await client.query<SupersededRow>(
        `DELETE FROM soundtrack_renders superseded USING soundtrack_renders kept
         WHERE kept.id = $1 AND superseded.story_id = kept.story_id AND superseded.id <> kept.id
           AND superseded.created_at <= kept.created_at
           AND NOT EXISTS (
             SELECT 1 FROM story_exports export WHERE export.story_id = superseded.story_id
               AND export.status IN ('queued', 'assembling')
               AND export.manifest->'soundtrack'->>'renderId' = superseded.id::text
           )
         RETURNING superseded.preview_storage_key, superseded.rhythm_storage_key, superseded.melody_storage_key,
           superseded.rhythm_preview_storage_key, superseded.melody_preview_storage_key`, [renderId],
      );
      await client.query(
        `INSERT INTO product_activity_events (profile_id, code, dedupe_key) VALUES ($1, 'story.soundtrack_ready', $2)
         ON CONFLICT (dedupe_key) DO NOTHING`, [profileId, `story.soundtrack_ready:${renderId}`],
      );
      await client.query("COMMIT");
      return { accepted: true, supersededStorageKeys: superseded.rows.flatMap((row) => Object.values(row).filter(isKey)) };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async fail(renderId: string, workerId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE soundtrack_renders SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
       progress_phase = CASE WHEN attempts >= 3 THEN progress_phase ELSE 'queued' END,
       error = $3, worker_id = NULL, locked_until = NULL, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'running'`, [renderId, workerId, error.slice(0, 4_000)],
    );
  }
}

function isKey(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function mapSoundtrackRow(row: SoundtrackRow): SoundtrackRenderJob {
  const artifact = (prefix: "preview" | "rhythm" | "melody" | "rhythm_preview" | "melody_preview",
    mimeType: "audio/mp4" | "audio/flac") => {
    const storageKey = row[`${prefix}_storage_key`];
    const sizeBytes = row[`${prefix}_size_bytes`];
    const contentHash = row[`${prefix}_content_hash`];
    return storageKey && sizeBytes !== null && contentHash
      ? { storageKey, sizeBytes: Number(sizeBytes), contentHash, mimeType } : undefined;
  };
  const preview = artifact("preview", "audio/mp4");
  const rhythmStem = artifact("rhythm", "audio/flac");
  const melodyStem = artifact("melody", "audio/flac");
  const rhythmPreview = artifact("rhythm_preview", "audio/mp4");
  const melodyPreview = artifact("melody_preview", "audio/mp4");
  return {
    id: row.id, profileId: row.profile_id, storyId: row.story_id, inputHash: row.input_hash, input: row.input,
    status: row.status, progressPercent: Number(row.progress_percent), progressPhase: row.progress_phase,
    createdAt: new Date(row.created_at).toISOString(),
    ...(preview ? { preview } : {}), ...(rhythmStem ? { rhythmStem } : {}), ...(melodyStem ? { melodyStem } : {}),
    ...(rhythmPreview ? { rhythmPreview } : {}), ...(melodyPreview ? { melodyPreview } : {}),
    ...(row.provenance ? { provenance: row.provenance } : {}), ...(row.error ? { error: row.error } : {}),
  };
}

type SupersededRow = Record<"preview_storage_key" | "rhythm_storage_key" | "melody_storage_key"
  | "rhythm_preview_storage_key" | "melody_preview_storage_key", string | null>;

interface SoundtrackRow {
  readonly id: string; readonly profile_id: string; readonly story_id: string; readonly input_hash: string;
  readonly input: SoundtrackRenderInput; readonly status: SoundtrackRenderStatus;
  readonly progress_percent: number; readonly progress_phase: SoundtrackRenderPhase;
  readonly preview_storage_key: string | null; readonly preview_size_bytes: string | number | null;
  readonly preview_content_hash: string | null; readonly rhythm_storage_key: string | null;
  readonly rhythm_size_bytes: string | number | null; readonly rhythm_content_hash: string | null;
  readonly melody_storage_key: string | null; readonly melody_size_bytes: string | number | null;
  readonly melody_content_hash: string | null;
  readonly rhythm_preview_storage_key: string | null; readonly rhythm_preview_size_bytes: string | number | null;
  readonly rhythm_preview_content_hash: string | null;
  readonly melody_preview_storage_key: string | null; readonly melody_preview_size_bytes: string | number | null;
  readonly melody_preview_content_hash: string | null; readonly provenance: SoundtrackProvenance | null;
  readonly created_at: Date | string; readonly error: string | null;
}
