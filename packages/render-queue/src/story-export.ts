import type { RationalFrameRate } from "@storyteller/domain";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { SceneRenderInput, SceneRenderJob } from "./index.js";

export const storyExportStatuses = ["queued", "rendering", "assembling", "ready", "failed", "canceled"] as const;
export type StoryExportStatus = typeof storyExportStatuses[number];
export const storyExportPhases = ["queued", "rendering_segments", "assembling", "uploading", "ready"] as const;
export type StoryExportPhase = typeof storyExportPhases[number];
export type StoryExportErrorCode = "story_revision_changed" | "segment_failed" | "segment_profile_mismatch"
  | "approved_mix_mismatch" | "assembly_failed";

export interface StoryExportManifestSegment {
  readonly position: number;
  readonly sceneId: string;
  readonly durationFrames: number;
  readonly inputHash: string;
  readonly input: SceneRenderInput;
}

export interface StoryExportManifest {
  readonly version: 1;
  readonly storyRevision: number;
  readonly timelineHash: string;
  readonly outputProfileId: "vertical-social-v1";
  readonly frameRate: RationalFrameRate;
  readonly totalFrames: number;
  readonly approvedMix: {
    readonly storageKey: string;
    readonly contentHash: string;
    readonly durationFrames: number;
  };
  readonly segments: readonly StoryExportManifestSegment[];
}

export interface StoryExportJob {
  readonly id: string;
  readonly profileId: string;
  readonly storyId: string;
  readonly manifestHash: string;
  readonly manifest: StoryExportManifest;
  readonly status: StoryExportStatus;
  readonly progressPercent: number;
  readonly progressPhase: StoryExportPhase;
  readonly readySegments: number;
  readonly totalSegments: number;
  readonly storageKey?: string;
  readonly sizeBytes?: number;
  readonly contentHash?: string;
  readonly errorCode?: StoryExportErrorCode;
  readonly createdAt: string;
}

export interface ClaimedStoryExport extends StoryExportJob {
  readonly segments: readonly Pick<SceneRenderJob, "id" | "sceneId" | "storageKey" | "contentHash" | "input">[];
}

export interface StoryExportQueue {
  enqueue(job: Pick<StoryExportJob, "id" | "profileId" | "storyId" | "manifestHash" | "manifest">): Promise<StoryExportJob | undefined>;
  findCurrentAuthorized(profileId: string, storyId: string): Promise<StoryExportJob | undefined>;
  findAuthorized(profileId: string, storyId: string, exportId: string): Promise<StoryExportJob | undefined>;
  claimAssembly(workerId: string, leaseMilliseconds: number): Promise<ClaimedStoryExport | undefined>;
  reportAssemblyProgress(exportId: string, workerId: string, progressPercent: number, phase: "assembling" | "uploading"): Promise<boolean>;
  complete(exportId: string, workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean>;
  fail(exportId: string, workerId: string, errorCode: StoryExportErrorCode, error: string): Promise<void>;
}

export class PostgresStoryExportQueue implements StoryExportQueue {
  constructor(private readonly pool: Pool) {}

  async enqueue(job: Pick<StoryExportJob, "id" | "profileId" | "storyId" | "manifestHash" | "manifest">): Promise<StoryExportJob | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const authorized = await client.query<{ revision: number }>(
        "SELECT revision FROM stories WHERE id = $1 AND profile_id = $2 FOR SHARE", [job.storyId, job.profileId],
      );
      if (authorized.rows[0]?.revision !== job.manifest.storyRevision) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const parent = await client.query<{ id: string; status: StoryExportStatus }>(
        `INSERT INTO story_exports (id, profile_id, story_id, manifest_hash, manifest, story_revision, timeline_hash, output_profile_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
         ON CONFLICT (story_id, manifest_hash) DO UPDATE SET
           status = CASE WHEN story_exports.status = 'failed' THEN 'queued' ELSE story_exports.status END,
           error_code = CASE WHEN story_exports.status = 'failed' THEN NULL ELSE story_exports.error_code END,
           error = CASE WHEN story_exports.status = 'failed' THEN NULL ELSE story_exports.error END,
           attempts = CASE WHEN story_exports.status = 'failed' THEN 0 ELSE story_exports.attempts END,
           worker_id = CASE WHEN story_exports.status = 'failed' THEN NULL ELSE story_exports.worker_id END,
           locked_until = CASE WHEN story_exports.status = 'failed' THEN NULL ELSE story_exports.locked_until END,
           progress_percent = CASE WHEN story_exports.status = 'failed' THEN 0 ELSE story_exports.progress_percent END,
           progress_phase = CASE WHEN story_exports.status = 'failed' THEN 'queued' ELSE story_exports.progress_phase END,
           updated_at = now()
         RETURNING id, status`,
        [job.id, job.profileId, job.storyId, job.manifestHash, job.manifest, job.manifest.storyRevision,
          job.manifest.timelineHash, job.manifest.outputProfileId],
      );
      const exportId = parent.rows[0]!.id;
      if (parent.rows[0]!.status !== "ready") {
        for (const segment of job.manifest.segments) {
          const rendered = await client.query<{ id: string }>(
            `INSERT INTO scene_renders (id, profile_id, story_id, scene_id, input_hash, input, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'queued')
             ON CONFLICT (story_id, scene_id, input_hash) DO UPDATE SET
               status = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 'queued' ELSE scene_renders.status END,
               error = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.error END,
               attempts = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 0 ELSE scene_renders.attempts END,
               worker_id = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.worker_id END,
               locked_until = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.locked_until END,
               storage_key = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.storage_key END,
               size_bytes = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.size_bytes END,
               content_hash = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.content_hash END,
               progress_percent = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 0 ELSE scene_renders.progress_percent END,
               progress_phase = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 'queued' ELSE scene_renders.progress_phase END,
               updated_at = now()
             RETURNING id`,
            [randomUUID(), job.profileId, job.storyId, segment.sceneId, segment.inputHash, segment.input],
          );
          await client.query(
            `INSERT INTO story_export_segments (export_id, position, scene_id, duration_frames, scene_render_id)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (export_id, position) DO NOTHING`,
            [exportId, segment.position, segment.sceneId, segment.durationFrames, rendered.rows[0]!.id],
          );
        }
      }
      await client.query(
        `INSERT INTO product_activity_events (profile_id, code, dedupe_key) VALUES ($1, 'story.export_requested', $2)
         ON CONFLICT (dedupe_key) DO NOTHING`, [job.profileId, `story.export_requested:${exportId}`],
      );
      await client.query("COMMIT");
      return await this.findAuthorized(job.profileId, job.storyId, exportId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async findCurrentAuthorized(profileId: string, storyId: string): Promise<StoryExportJob | undefined> {
    await this.synchronize(storyId);
    const result = await this.pool.query<ExportRow>(
      `${exportSelect} WHERE e.profile_id = $1 AND e.story_id = $2 ORDER BY e.created_at DESC, e.id DESC LIMIT 1`,
      [profileId, storyId],
    );
    return result.rows[0] && mapExportRow(result.rows[0]);
  }

  async findAuthorized(profileId: string, storyId: string, exportId: string): Promise<StoryExportJob | undefined> {
    await this.synchronize(storyId);
    const result = await this.pool.query<ExportRow>(
      `${exportSelect} WHERE e.id = $1 AND e.profile_id = $2 AND e.story_id = $3`, [exportId, profileId, storyId],
    );
    return result.rows[0] && mapExportRow(result.rows[0]);
  }

  async claimAssembly(workerId: string, leaseMilliseconds: number): Promise<ClaimedStoryExport | undefined> {
    await this.synchronize();
    const claimed = await this.pool.query<ExportRow>(
      `WITH candidate AS (
         SELECT e.id FROM story_exports e JOIN stories story ON story.id = e.story_id AND story.revision = e.story_revision
         WHERE (e.status = 'queued' OR (e.status = 'assembling' AND e.locked_until < now())) AND e.attempts < 3
           AND NOT EXISTS (
             SELECT 1 FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
             WHERE link.export_id = e.id AND render.status <> 'ready'
           )
         ORDER BY e.created_at FOR UPDATE OF e SKIP LOCKED LIMIT 1
       )
       UPDATE story_exports e SET status = 'assembling', progress_percent = GREATEST(progress_percent, 90),
         progress_phase = 'assembling', worker_id = $1, locked_until = now() + ($2 * interval '1 millisecond'),
         attempts = attempts + 1, updated_at = now()
       FROM candidate WHERE e.id = candidate.id RETURNING e.*`, [workerId, leaseMilliseconds],
    );
    const row = claimed.rows[0];
    if (!row) return undefined;
    const job = await this.findAuthorized(row.profile_id, row.story_id, row.id);
    if (!job) return undefined;
    const segments = await this.pool.query<SegmentRow>(
      `SELECT render.id, render.scene_id, render.input, render.storage_key, render.content_hash
       FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
       WHERE link.export_id = $1 ORDER BY link.position`, [row.id],
    );
    return { ...job, segments: segments.rows.map((segment) => ({
      id: segment.id, sceneId: segment.scene_id, input: segment.input,
      ...(segment.storage_key ? { storageKey: segment.storage_key } : {}),
      ...(segment.content_hash ? { contentHash: segment.content_hash } : {}),
    })) };
  }

  async reportAssemblyProgress(exportId: string, workerId: string, progressPercent: number, phase: "assembling" | "uploading"): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE story_exports SET progress_percent = GREATEST(progress_percent, $3), progress_phase = $4, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'assembling'`,
      [exportId, workerId, Math.max(90, Math.min(99, Math.round(progressPercent))), phase],
    );
    return result.rowCount === 1;
  }

  async complete(exportId: string, workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const completed = await client.query<{ profile_id: string }>(
        `UPDATE story_exports SET status = 'ready', progress_percent = 100, progress_phase = 'ready', storage_key = $3,
           size_bytes = $4, content_hash = $5, error_code = NULL, error = NULL, worker_id = NULL, locked_until = NULL, updated_at = now()
         WHERE id = $1 AND worker_id = $2 AND status = 'assembling' RETURNING profile_id`,
        [exportId, workerId, storageKey, sizeBytes, contentHash],
      );
      const profileId = completed.rows[0]?.profile_id;
      if (!profileId) { await client.query("ROLLBACK"); return false; }
      await client.query(
        `INSERT INTO product_activity_events (profile_id, code, dedupe_key) VALUES ($1, 'story.export_ready', $2)
         ON CONFLICT (dedupe_key) DO NOTHING`, [profileId, `story.export_ready:${exportId}`],
      );
      await client.query(
         `WITH obsolete AS (
           SELECT render.id, render.storage_key FROM story_export_segments link
           JOIN scene_renders render ON render.id = link.scene_render_id WHERE link.export_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM story_export_segments other_link JOIN story_exports other_export ON other_export.id = other_link.export_id
               WHERE other_link.scene_render_id = render.id AND other_link.export_id <> $1
                 AND other_export.status IN ('queued', 'assembling')
             )
         ), cleared AS (
           UPDATE scene_renders render SET status = 'canceled', storage_key = NULL, size_bytes = NULL, content_hash = NULL,
             worker_id = NULL, locked_until = NULL, updated_at = now()
           FROM obsolete WHERE render.id = obsolete.id RETURNING render.id
         )
         INSERT INTO object_deletion_jobs (storage_key)
         SELECT DISTINCT storage_key FROM obsolete WHERE storage_key IS NOT NULL
         ON CONFLICT (storage_key) DO UPDATE SET status = 'queued', attempts = 0, worker_id = NULL,
           locked_until = NULL, error = NULL, updated_at = now()`, [exportId],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async fail(exportId: string, workerId: string, errorCode: StoryExportErrorCode, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE story_exports SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
       error_code = $3, error = $4, worker_id = NULL, locked_until = NULL, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'assembling'`,
      [exportId, workerId, errorCode, error.slice(0, 4_000)],
    );
  }

  private async synchronize(storyId?: string): Promise<void> {
    await this.pool.query(
      `WITH stale AS (
         UPDATE story_exports export SET status = 'canceled', error_code = 'story_revision_changed',
           error = 'story revision changed', worker_id = NULL, locked_until = NULL, updated_at = now()
         FROM stories story WHERE story.id = export.story_id AND story.revision <> export.story_revision
           AND export.status IN ('queued', 'assembling') AND ($1::uuid IS NULL OR export.story_id = $1)
         RETURNING export.id
       ), orphaned AS (
         SELECT DISTINCT render.id FROM stale
         JOIN story_export_segments link ON link.export_id = stale.id
         JOIN scene_renders render ON render.id = link.scene_render_id
         WHERE render.status IN ('queued', 'running') AND NOT EXISTS (
           SELECT 1 FROM story_export_segments active_link
           JOIN story_exports active_export ON active_export.id = active_link.export_id
           WHERE active_link.scene_render_id = render.id AND active_export.status IN ('queued', 'assembling')
         )
       )
       UPDATE scene_renders render SET status = 'canceled', error = 'story revision changed',
         worker_id = NULL, locked_until = NULL, updated_at = now()
       FROM orphaned WHERE render.id = orphaned.id`, [storyId ?? null],
    );
    await this.pool.query(
      `UPDATE story_exports export SET status = 'failed', error_code = 'segment_failed',
         error = 'one or more story segments failed', updated_at = now()
       WHERE export.status = 'queued' AND ($1::uuid IS NULL OR export.story_id = $1) AND EXISTS (
         SELECT 1 FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
         WHERE link.export_id = export.id AND render.status = 'failed'
       )`, [storyId ?? null],
    );
  }
}

const exportSelect = `SELECT e.*,
  (SELECT count(*)::integer FROM story_export_segments link WHERE link.export_id = e.id) AS total_segments,
  (SELECT count(*)::integer FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
    WHERE link.export_id = e.id AND render.status = 'ready') AS ready_segments,
  (SELECT COALESCE(sum(link.duration_frames * CASE WHEN render.status = 'ready' THEN 100 ELSE render.progress_percent END), 0)::float8
      / GREATEST(1, COALESCE(sum(link.duration_frames), 0))
    FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
    WHERE link.export_id = e.id) AS segment_progress
 FROM story_exports e`;

function mapExportRow(row: ExportRow): StoryExportJob {
  const totalSegments = Number(row.total_segments ?? row.manifest.segments.length);
  const segmentProgress = Number(row.segment_progress ?? 0);
  const status = row.status === "queued" && segmentProgress > 0 ? "rendering" : row.status;
  return {
    id: row.id, profileId: row.profile_id, storyId: row.story_id, manifestHash: row.manifest_hash,
    manifest: row.manifest, status,
    progressPercent: row.status === "queued" ? Math.min(89, Math.round(segmentProgress * 0.89)) : Number(row.progress_percent),
    progressPhase: row.status === "queued" && segmentProgress > 0 ? "rendering_segments" : row.progress_phase,
    readySegments: row.status === "ready" ? totalSegments : Number(row.ready_segments ?? 0), totalSegments,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.storage_key ? { storageKey: row.storage_key } : {}), ...(row.size_bytes === null ? {} : { sizeBytes: Number(row.size_bytes) }),
    ...(row.content_hash ? { contentHash: row.content_hash } : {}), ...(row.error_code ? { errorCode: row.error_code } : {}),
  };
}

interface ExportRow {
  id: string; profile_id: string; story_id: string; manifest_hash: string; manifest: StoryExportManifest;
  status: Exclude<StoryExportStatus, "rendering">; progress_percent: number; progress_phase: StoryExportPhase;
  storage_key: string | null; size_bytes: number | string | null; content_hash: string | null;
  error_code: StoryExportErrorCode | null; created_at: Date | string;
  total_segments?: number; ready_segments?: number; segment_progress?: number;
}
interface SegmentRow { id: string; scene_id: string; input: SceneRenderInput; storage_key: string | null; content_hash: string | null }
