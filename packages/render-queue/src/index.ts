import type { CollageSettings, FocusPoint, MaterialEdit, MaterialOrientation, RationalFrameRate, SceneMotion, SceneTitle, VideoExportMode } from "@storyteller/domain";
import type { Pool } from "pg";
import type { RenderDependency } from "./render-version.js";
export { hashSceneRenderInput, sceneRenderParameters, type RenderDependency } from "./render-version.js";
export * from "./story-export.js";

export const sceneRenderStatuses = ["queued", "running", "ready", "failed", "canceled"] as const;
export type SceneRenderStatus = (typeof sceneRenderStatuses)[number];
export const sceneRenderProgressPhases = ["queued", "downloading", "rendering", "finalizing", "uploading", "ready"] as const;
export type SceneRenderProgressPhase = (typeof sceneRenderProgressPhases)[number];

export interface StillImageRenderInput {
  /** A frame is a separate derived artifact of the base visual composition. */
  readonly artifact?: "scene-frame" | "story-export-segment";
  readonly frame?: {
    readonly rendererVersion: number;
    readonly format: "png";
    readonly compressionLevel: number;
    readonly intermediateCodec: "h264-lossless";
    readonly layerPolicy: "base-visual";
  };
  readonly dependencies?: readonly RenderDependency[];
  readonly rendererId: "still-image";
  readonly rendererVersion: number;
  readonly title?: SceneTitle & { readonly rendererVersion: string };
  readonly material: {
    readonly contentHash?: string;
    readonly storageKey: string;
    readonly name: string;
    readonly mimeType: string;
    readonly width: number;
    readonly height: number;
    readonly orientation: MaterialOrientation;
  };
  readonly durationSeconds: number;
  readonly motion: SceneMotion;
  readonly focusPoint: FocusPoint;
  readonly output: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly codec: "h264";
    readonly profileId?: "vertical-social-v1";
    readonly frameRate?: RationalFrameRate;
    readonly durationFrames?: number;
  };
}

export interface VideoRenderInput extends Omit<StillImageRenderInput, "rendererId"> {
  readonly rendererId: "video";
  readonly mode: VideoExportMode;
  readonly edit: MaterialEdit;
  readonly hasAudio: boolean;
  readonly sourceDurationSeconds?: number;
  readonly audio?: { readonly storageKey: string; readonly name: string; readonly mimeType: string; readonly contentHash?: string };
}

export interface CollageRenderMaterial {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly contentHash?: string;
  readonly storageKey: string;
  readonly name: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly orientation: MaterialOrientation;
  /** Original decoded dimensions used when applying a video edit. */
  readonly sourceWidth?: number;
  readonly sourceHeight?: number;
  readonly sourceDurationSeconds?: number;
  readonly edit?: MaterialEdit;
}

export interface CollageRenderInput extends Omit<StillImageRenderInput, "rendererId" | "material" | "motion" | "focusPoint"> {
  readonly rendererId: "collage";
  readonly layoutId: string;
  readonly layoutRendererId: string;
  /** Fixed geometry from the selected layout, never an editable scene setting. */
  readonly layoutOverlapRatio: number;
  readonly settings: CollageSettings;
  /** Explicitly records the source used behind the entering cards. */
  readonly background?: {
    readonly source: "custom-material" | "card-fallback";
    readonly materialId: string;
    readonly treatment: "darkened" | "original";
    readonly material: CollageRenderMaterial;
  } | {
    readonly source: "previous-scene-frame";
    readonly treatment: "darkened";
    readonly sceneId: string;
    readonly inputHash: string;
    readonly contentHash: string;
    readonly storageKey: string;
    readonly name: string;
    readonly mimeType: "image/png";
    readonly width: number;
    readonly height: number;
    readonly orientation: MaterialOrientation;
  };
  readonly materials: readonly CollageRenderMaterial[];
}

export type SceneRenderInput = StillImageRenderInput | VideoRenderInput | CollageRenderInput;

export interface SceneRenderJob {
  readonly id: string;
  readonly profileId: string;
  readonly storyId: string;
  readonly sceneId: string;
  readonly inputHash: string;
  readonly input: SceneRenderInput;
  readonly status: SceneRenderStatus;
  readonly progressPercent?: number;
  readonly progressPhase?: SceneRenderProgressPhase;
  readonly storageKey?: string;
  readonly sizeBytes?: number;
  readonly contentHash?: string;
  readonly createdAt?: string;
  readonly error?: string;
}

export interface ObjectDeletionJob {
  readonly storageKey: string;
}

export interface SceneRenderQueue {
  /**
   * Returns undefined if the scene disappeared or expectedRevision changed before enqueue.
   * Enqueuing replaces the previous result in the same artifact/output slot while preserving
   * source and intermediate dependencies stored outside that slot.
   */
  enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">, expectedRevision?: number): Promise<SceneRenderJob | undefined>;
  listAuthorized(profileId: string, storyId: string, sceneId: string): Promise<readonly SceneRenderJob[]>;
  findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined>;
  claim(workerId: string, leaseMilliseconds: number, kind?: "interactive" | "story-export-segment"): Promise<SceneRenderJob | undefined>;
  reportProgress(renderId: string, workerId: string, progressPercent: number, progressPhase: SceneRenderProgressPhase): Promise<boolean>;
  complete(renderId: string, workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean>;
  fail(renderId: string, workerId: string, error: string): Promise<void>;
  scheduleDeletion(storageKey: string): Promise<void>;
  claimDeletion(workerId: string, leaseMilliseconds: number): Promise<ObjectDeletionJob | undefined>;
  completeDeletion(storageKey: string, workerId: string): Promise<void>;
  failDeletion(storageKey: string, workerId: string, error: string): Promise<void>;
}

export class PostgresSceneRenderQueue implements SceneRenderQueue {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">, expectedRevision?: number): Promise<SceneRenderJob | undefined> {
    const result = await this.pool.query<RenderRow>(
      `WITH authorized_scene AS (
         SELECT id FROM stories WHERE id = $3 AND profile_id = $2
           AND ($7::integer IS NULL OR revision = $7)
           AND payload->'scenes' @> jsonb_build_array(jsonb_build_object('id', $4::uuid))
         FOR SHARE
       ), retained AS (
         INSERT INTO scene_renders (id, profile_id, story_id, scene_id, input_hash, input, status)
         SELECT $1, $2, $3, $4, $5, $6, 'queued' FROM authorized_scene
         ON CONFLICT (story_id, scene_id, input_hash) DO UPDATE SET
           input = CASE WHEN scene_renders.status IN ('queued', 'failed', 'canceled') THEN EXCLUDED.input ELSE scene_renders.input END,
           status = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 'queued' ELSE scene_renders.status END,
           error = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.error END,
           attempts = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 0 ELSE scene_renders.attempts END,
           worker_id = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.worker_id END,
           locked_until = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.locked_until END,
           progress_percent = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 0 ELSE scene_renders.progress_percent END,
           progress_phase = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 'queued' ELSE scene_renders.progress_phase END,
           updated_at = now()
         RETURNING id, profile_id, story_id, scene_id, input_hash, input, status, progress_percent, progress_phase,
           storage_key, size_bytes, content_hash, created_at, error, render_slot
       ), superseded AS (
         DELETE FROM scene_renders previous USING retained current
         WHERE previous.story_id = current.story_id
           AND previous.scene_id = current.scene_id
           AND previous.render_slot = current.render_slot
           AND previous.id <> current.id
         RETURNING previous.storage_key
       ), scheduled_deletions AS (
         INSERT INTO object_deletion_jobs (storage_key)
         SELECT DISTINCT storage_key FROM superseded WHERE storage_key IS NOT NULL
         ON CONFLICT (storage_key) DO UPDATE SET status = 'queued', attempts = 0, worker_id = NULL,
           locked_until = NULL, error = NULL, updated_at = now()
         RETURNING storage_key
       ), activity AS (
         INSERT INTO product_activity_events (profile_id, code, dedupe_key)
         SELECT profile_id, 'scene.render_requested', 'scene.render_requested:' || id::text
         FROM retained WHERE input->>'artifact' IS DISTINCT FROM 'scene-frame'
           AND input->>'artifact' IS DISTINCT FROM 'story-export-segment'
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id
       )
       SELECT id, profile_id, story_id, scene_id, input_hash, input, status, progress_percent, progress_phase,
         storage_key, size_bytes, content_hash, created_at, error FROM retained`,
      [job.id, job.profileId, job.storyId, job.sceneId, job.inputHash, job.input, expectedRevision ?? null],
    );
    return result.rows[0] && mapRenderRow(result.rows[0]);
  }

  async listAuthorized(profileId: string, storyId: string, sceneId: string): Promise<readonly SceneRenderJob[]> {
    const result = await this.pool.query<RenderRow>(
      `SELECT id, profile_id, story_id, scene_id, input_hash, input, status, progress_percent, progress_phase,
         storage_key, size_bytes, content_hash, created_at, error
       FROM scene_renders WHERE profile_id = $1 AND story_id = $2 AND scene_id = $3 ORDER BY created_at DESC, id DESC`,
      [profileId, storyId, sceneId],
    );
    return result.rows.map(mapRenderRow);
  }

  async findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined> {
    const result = await this.pool.query<RenderRow>(
      `SELECT id, profile_id, story_id, scene_id, input_hash, input, status, progress_percent, progress_phase,
         storage_key, size_bytes, content_hash, created_at, error
       FROM scene_renders WHERE id = $1 AND profile_id = $2 AND story_id = $3 AND scene_id = $4`,
      [renderId, profileId, storyId, sceneId],
    );
    return result.rows[0] && mapRenderRow(result.rows[0]);
  }

  async claim(workerId: string, leaseMilliseconds: number, kind?: "interactive" | "story-export-segment"): Promise<SceneRenderJob | undefined> {
    const result = await this.pool.query<RenderRow>(
      `WITH candidate AS (
         SELECT id FROM scene_renders
         WHERE (status = 'queued' OR (status = 'running' AND locked_until < now())) AND attempts < 3
           AND ($3::text IS NULL
             OR ($3 = 'story-export-segment' AND input->>'artifact' = 'story-export-segment')
             OR ($3 = 'interactive' AND input->>'artifact' IS DISTINCT FROM 'story-export-segment'))
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE scene_renders r SET status = 'running', worker_id = $1, progress_percent = 1, progress_phase = 'downloading',
         locked_until = now() + ($2 * interval '1 millisecond'), attempts = attempts + 1, updated_at = now()
       FROM candidate WHERE r.id = candidate.id
       RETURNING r.id, r.profile_id, r.story_id, r.scene_id, r.input_hash, r.input, r.status,
         r.progress_percent, r.progress_phase, r.storage_key, r.size_bytes, r.content_hash, r.created_at, r.error`,
      [workerId, leaseMilliseconds, kind ?? null],
    );
    return result.rows[0] && mapRenderRow(result.rows[0]);
  }

  async reportProgress(
    renderId: string,
    workerId: string,
    progressPercent: number,
    progressPhase: SceneRenderProgressPhase,
  ): Promise<boolean> {
    const percent = Math.max(1, Math.min(99, Math.round(progressPercent)));
    const result = await this.pool.query(
      `UPDATE scene_renders SET progress_percent = GREATEST(progress_percent, $3), progress_phase = $4, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'running'`,
      [renderId, workerId, percent, progressPhase],
    );
    return result.rowCount === 1;
  }

  async complete(renderId: string, workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean> {
    const result = await this.pool.query<{ accepted: boolean }>(
      `WITH completed AS (
         UPDATE scene_renders SET status = 'ready', progress_percent = 100, progress_phase = 'ready',
           storage_key = $3, size_bytes = $4, content_hash = $5, error = NULL,
           worker_id = NULL, locked_until = NULL, updated_at = now()
         WHERE id = $1 AND worker_id = $2 AND status = 'running'
         RETURNING id, profile_id, input
       ), activity AS (
         INSERT INTO product_activity_events (profile_id, code, dedupe_key)
         SELECT profile_id, 'scene.render_ready', 'scene.render_ready:' || id::text
         FROM completed WHERE input->>'artifact' IS DISTINCT FROM 'scene-frame'
           AND input->>'artifact' IS DISTINCT FROM 'story-export-segment'
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id
       )
       SELECT EXISTS (SELECT 1 FROM completed) AS accepted`,
      [renderId, workerId, storageKey, sizeBytes, contentHash],
    );
    return result.rows[0]?.accepted ?? false;
  }

  async fail(renderId: string, workerId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE scene_renders SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
       progress_percent = CASE WHEN attempts >= 3 THEN progress_percent ELSE 0 END,
       progress_phase = CASE WHEN attempts >= 3 THEN progress_phase ELSE 'queued' END,
       error = $3, worker_id = NULL, locked_until = NULL, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'running'`,
      [renderId, workerId, error.slice(0, 4_000)],
    );
  }

  async scheduleDeletion(storageKey: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO object_deletion_jobs (storage_key) VALUES ($1)
       ON CONFLICT (storage_key) DO UPDATE SET status = 'queued', attempts = 0, worker_id = NULL,
         locked_until = NULL, error = NULL, updated_at = now()`,
      [storageKey],
    );
  }

  async claimDeletion(workerId: string, leaseMilliseconds: number): Promise<ObjectDeletionJob | undefined> {
    const result = await this.pool.query<{ storage_key: string }>(
      `WITH candidate AS (
         SELECT storage_key FROM object_deletion_jobs
         WHERE (status = 'queued' OR (status = 'running' AND locked_until < now())) AND attempts < 10
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE object_deletion_jobs d SET status = 'running', worker_id = $1,
         locked_until = now() + ($2 * interval '1 millisecond'), attempts = attempts + 1, updated_at = now()
       FROM candidate WHERE d.storage_key = candidate.storage_key RETURNING d.storage_key`,
      [workerId, leaseMilliseconds],
    );
    const row = result.rows[0];
    return row && { storageKey: row.storage_key };
  }

  async completeDeletion(storageKey: string, workerId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM object_deletion_jobs WHERE storage_key = $1 AND worker_id = $2 AND status = 'running'",
      [storageKey, workerId],
    );
  }

  async failDeletion(storageKey: string, workerId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE object_deletion_jobs SET status = CASE WHEN attempts >= 10 THEN 'failed' ELSE 'queued' END,
       error = $3, worker_id = NULL, locked_until = NULL, updated_at = now()
       WHERE storage_key = $1 AND worker_id = $2 AND status = 'running'`,
      [storageKey, workerId, error.slice(0, 4_000)],
    );
  }
}

export function sceneRenderStorageKey(job: Pick<SceneRenderJob, "profileId" | "storyId" | "sceneId" | "inputHash"> & { input?: SceneRenderInput }, attemptId?: string): string {
  const extension = job.input ? sceneRenderFileType(job.input).extension : "mp4";
  const collection = job.input?.artifact === "scene-frame" ? "frames" : "renders";
  return `projects/${job.profileId}/${job.storyId}/scenes/${job.sceneId}/${collection}/${job.inputHash}${attemptId ? `-${attemptId}` : ""}.${extension}`;
}

export function sceneRenderFileType(input: SceneRenderInput) {
  if (input.artifact === "scene-frame") return { extension: "png", mimeType: "image/png" } as const;
  return input.rendererId === "video" && input.mode === "audio"
    ? { extension: "m4a", mimeType: "audio/mp4" } as const : { extension: "mp4", mimeType: "video/mp4" } as const;
}

export function isSceneFrameInput(input: SceneRenderInput): boolean {
  return input.artifact === "scene-frame";
}

/** One retained result per independently downloadable output or intermediate artifact. */
export function sceneRenderSlot(input: SceneRenderInput): string {
  if (isSceneFrameInput(input)) return "scene-frame";
  if (input.artifact === "story-export-segment") return `story-export-segment:${input.output.profileId ?? "unknown"}`;
  return `scene-render:${input.rendererId === "video" ? input.mode : "video"}`;
}

export function sceneFrameDependency(frame: Pick<SceneRenderJob, "sceneId" | "inputHash" | "storageKey" | "contentHash">): RenderDependency {
  if (!frame.storageKey || !frame.contentHash) throw new Error("ready scene frame storage and content hash are required");
  return {
    role: "scene-frame",
    storageKey: frame.storageKey,
    contentHash: frame.contentHash,
    parents: [],
    parameters: { sceneId: frame.sceneId, inputHash: frame.inputHash },
  };
}

function mapRenderRow(row: RenderRow): SceneRenderJob {
  return {
    id: row.id,
    profileId: row.profile_id,
    storyId: row.story_id,
    sceneId: row.scene_id,
    inputHash: row.input_hash,
    input: row.input,
    status: row.status,
    progressPercent: row.status === "ready" ? 100 : row.progress_percent,
    progressPhase: row.status === "ready" ? "ready" : row.progress_phase,
    createdAt: row.created_at.toISOString(),
    ...(row.content_hash === null ? {} : { contentHash: row.content_hash }),
    ...(row.storage_key === null ? {} : { storageKey: row.storage_key }),
    ...(row.size_bytes === null ? {} : { sizeBytes: Number(row.size_bytes) }),
    ...(row.error === null ? {} : { error: row.error }),
  };
}

interface RenderRow {
  readonly id: string;
  readonly profile_id: string;
  readonly story_id: string;
  readonly scene_id: string;
  readonly input_hash: string;
  readonly input: SceneRenderInput;
  readonly status: SceneRenderStatus;
  readonly progress_percent: number;
  readonly progress_phase: SceneRenderProgressPhase;
  readonly storage_key: string | null;
  readonly size_bytes: string | number | null;
  readonly error: string | null;
  readonly content_hash: string | null;
  readonly created_at: Date;
}
