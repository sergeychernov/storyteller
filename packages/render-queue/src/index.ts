import { createHash } from "node:crypto";
import type { FocusPoint, MaterialOrientation, SceneMotion } from "@storyteller/domain";
import type { Pool } from "pg";

export const sceneRenderStatuses = ["queued", "running", "ready", "failed", "canceled"] as const;
export type SceneRenderStatus = (typeof sceneRenderStatuses)[number];

export interface SceneRenderInput {
  readonly rendererId: "still-image";
  readonly rendererVersion: number;
  readonly material: {
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
  };
}

export interface SceneRenderJob {
  readonly id: string;
  readonly profileId: string;
  readonly storyId: string;
  readonly sceneId: string;
  readonly inputHash: string;
  readonly input: SceneRenderInput;
  readonly status: SceneRenderStatus;
  readonly storageKey?: string;
  readonly sizeBytes?: number;
  readonly error?: string;
}

export interface ObjectDeletionJob {
  readonly storageKey: string;
}

export interface SceneRenderQueue {
  enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">): Promise<SceneRenderJob>;
  findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined>;
  claim(workerId: string, leaseMilliseconds: number): Promise<SceneRenderJob | undefined>;
  complete(renderId: string, workerId: string, storageKey: string, sizeBytes: number): Promise<boolean>;
  fail(renderId: string, workerId: string, error: string): Promise<void>;
  scheduleDeletion(storageKey: string): Promise<void>;
  claimDeletion(workerId: string, leaseMilliseconds: number): Promise<ObjectDeletionJob | undefined>;
  completeDeletion(storageKey: string, workerId: string): Promise<void>;
  failDeletion(storageKey: string, workerId: string, error: string): Promise<void>;
}

export class PostgresSceneRenderQueue implements SceneRenderQueue {
  constructor(private readonly pool: Pool) {}

  async enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">): Promise<SceneRenderJob> {
    const result = await this.pool.query<RenderRow>(
      `INSERT INTO scene_renders (id, profile_id, story_id, scene_id, input_hash, input, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued')
       ON CONFLICT (story_id, scene_id, input_hash) DO UPDATE SET
         status = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 'queued' ELSE scene_renders.status END,
         error = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.error END,
         attempts = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN 0 ELSE scene_renders.attempts END,
         worker_id = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.worker_id END,
         locked_until = CASE WHEN scene_renders.status IN ('failed', 'canceled') THEN NULL ELSE scene_renders.locked_until END,
         updated_at = now()
       RETURNING id, profile_id, story_id, scene_id, input_hash, input, status, storage_key, size_bytes, error`,
      [job.id, job.profileId, job.storyId, job.sceneId, job.inputHash, job.input],
    );
    return mapRenderRow(result.rows[0]!);
  }

  async findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined> {
    const result = await this.pool.query<RenderRow>(
      `SELECT id, profile_id, story_id, scene_id, input_hash, input, status, storage_key, size_bytes, error
       FROM scene_renders WHERE id = $1 AND profile_id = $2 AND story_id = $3 AND scene_id = $4`,
      [renderId, profileId, storyId, sceneId],
    );
    return result.rows[0] && mapRenderRow(result.rows[0]);
  }

  async claim(workerId: string, leaseMilliseconds: number): Promise<SceneRenderJob | undefined> {
    const result = await this.pool.query<RenderRow>(
      `WITH candidate AS (
         SELECT id FROM scene_renders
         WHERE (status = 'queued' OR (status = 'running' AND locked_until < now())) AND attempts < 3
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE scene_renders r SET status = 'running', worker_id = $1,
         locked_until = now() + ($2 * interval '1 millisecond'), attempts = attempts + 1, updated_at = now()
       FROM candidate WHERE r.id = candidate.id
       RETURNING r.id, r.profile_id, r.story_id, r.scene_id, r.input_hash, r.input, r.status, r.storage_key, r.size_bytes, r.error`,
      [workerId, leaseMilliseconds],
    );
    return result.rows[0] && mapRenderRow(result.rows[0]);
  }

  async complete(renderId: string, workerId: string, storageKey: string, sizeBytes: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE scene_renders SET status = 'ready', storage_key = $3, size_bytes = $4, error = NULL,
       worker_id = NULL, locked_until = NULL, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'running'`,
      [renderId, workerId, storageKey, sizeBytes],
    );
    return result.rowCount === 1;
  }

  async fail(renderId: string, workerId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE scene_renders SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
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

export function hashSceneRenderInput(input: SceneRenderInput): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

export function sceneRenderStorageKey(job: Pick<SceneRenderJob, "profileId" | "storyId" | "sceneId" | "inputHash">): string {
  return `projects/${job.profileId}/${job.storyId}/scenes/${job.sceneId}/renders/${job.inputHash}.mp4`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
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
  readonly storage_key: string | null;
  readonly size_bytes: string | number | null;
  readonly error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
