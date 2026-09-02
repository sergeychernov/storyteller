import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresSceneRenderQueue, PostgresStoryExportQueue, type StoryExportManifest,
} from "@storyteller/render-queue";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";

test("PostgreSQL: story export enqueues every segment atomically, barriers assembly and cancels stale work", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const profileId = randomUUID(), storyId = randomUUID();
  const sceneIds = [randomUUID(), randomUUID()];
  await pool.query(
    "INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Export', $2, 'hash')",
    [profileId, `${profileId}@example.test`],
  );
  await pool.query(
    `INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload)
     VALUES ($1, $2, 'Export', 'draft', 2, 7, $3)`,
    [storyId, profileId, { id: storyId, profileId, revision: 7, scenes: sceneIds.map((id) => ({ id })) }],
  );
  const queue = new PostgresStoryExportQueue(pool);
  const renderQueue = new PostgresSceneRenderQueue(pool);
  const manifest = exportManifest(sceneIds);
  const exportId = randomUUID();
  const queued = await queue.enqueue({
    id: exportId, profileId, storyId, manifestHash: "f".repeat(64), manifest,
  });
  assert.equal(queued?.totalSegments, 2);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM story_export_segments WHERE export_id = $1", [exportId])).rows[0].count, 2);
  assert.equal((await queue.claimAssembly("too-early", 1_000)), undefined);

  const claimed = await Promise.all([
    renderQueue.claim("segment-1", 10_000, "story-export-segment"),
    renderQueue.claim("segment-2", 10_000, "story-export-segment"),
  ]);
  assert.equal(new Set(claimed.map((job) => job?.id)).size, 2);
  assert.ok(claimed.every(Boolean));
  for (const [index, job] of claimed.entries()) {
    assert.equal(await renderQueue.complete(job!.id, `segment-${index + 1}`, `segment-${index}.mp4`, 100, String(index).repeat(64)), true);
  }
  const assembly = await queue.claimAssembly("assembly", 10_000);
  assert.equal(assembly?.segments.length, 2);
  assert.deepEqual(assembly?.segments.map(({ sceneId }) => sceneId), sceneIds);
  assert.equal(await queue.complete(exportId, "assembly", "master.mp4", 1_000, "e".repeat(64)), true);
  const ready = await queue.findAuthorized(profileId, storyId, exportId);
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.readySegments, 2);
  assert.deepEqual((await pool.query("SELECT code FROM product_activity_events ORDER BY id")).rows.map(({ code }) => code), [
    "story.export_requested", "story.export_ready",
  ]);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM object_deletion_jobs")).rows[0].count, 2);

  const staleId = randomUUID();
  await queue.enqueue({ id: staleId, profileId, storyId, manifestHash: "d".repeat(64), manifest: {
    ...manifest, approvedMix: { ...manifest.approvedMix, contentHash: "c".repeat(64) },
  } });
  await pool.query("UPDATE stories SET revision = 8 WHERE id = $1", [storyId]);
  const stale = await queue.findAuthorized(profileId, storyId, staleId);
  assert.equal(stale?.status, "canceled");
  assert.equal(stale?.errorCode, "story_revision_changed");
  assert.equal((await pool.query(
    `SELECT count(*)::integer AS count FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
     WHERE link.export_id = $1 AND render.status IN ('queued', 'running')`, [staleId],
  )).rows[0].count, 0);
});

test("PostgreSQL: a 30-scene export overlaps bounded claim waves, waits at the barrier, and retries only failures", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const profileId = randomUUID(), storyId = randomUUID();
  const sceneIds = Array.from({ length: 30 }, () => randomUUID());
  await pool.query(
    "INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Stress', $2, 'hash')",
    [profileId, `${profileId}@example.test`],
  );
  await pool.query(
    `INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload)
     VALUES ($1, $2, 'Stress', 'draft', 30, 7, $3)`,
    [storyId, profileId, { id: storyId, profileId, revision: 7, scenes: sceneIds.map((id) => ({ id })) }],
  );
  const queue = new PostgresStoryExportQueue(pool);
  const renderQueue = new PostgresSceneRenderQueue(pool);
  const manifest = exportManifest(sceneIds);
  const exportId = randomUUID();
  await queue.enqueue({ id: exportId, profileId, storyId, manifestHash: "9".repeat(64), manifest });

  const firstWave = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    renderQueue.claim(`bounded-${index}`, 10_000, "story-export-segment")));
  assert.equal(firstWave.filter(Boolean).length, 4);
  assert.equal(new Set(firstWave.map((job) => job?.id)).size, 4);
  assert.equal((await pool.query(
    "SELECT count(*)::integer AS count FROM scene_renders WHERE story_id = $1 AND status = 'running'", [storyId],
  )).rows[0].count, 4);
  assert.equal(await queue.claimAssembly("too-early", 1_000), undefined);

  const failedId = firstWave[0]!.id;
  await renderQueue.fail(failedId, "bounded-0", "transient segment failure");
  for (const [index, job] of firstWave.slice(1).entries()) {
    await renderQueue.complete(job!.id, `bounded-${index + 1}`, `ready-${index}.mp4`, 100, "a".repeat(64));
  }
  for (const attempt of [2, 3]) {
    for (let claimIndex = 0; ; claimIndex += 1) {
      const workerId = `bounded-retry-${attempt}-${claimIndex}`;
      const retried = await renderQueue.claim(workerId, 10_000, "story-export-segment");
      assert.ok(retried);
      if (retried.id === failedId) {
        await renderQueue.fail(failedId, workerId, "persistent segment failure");
        break;
      }
      await renderQueue.complete(retried.id, workerId, `retry-ready-${retried.id}.mp4`, 100, "c".repeat(64));
    }
  }
  const failedParent = await queue.findAuthorized(profileId, storyId, exportId);
  assert.equal(failedParent?.status, "failed");
  const readyBeforeRetry = (await pool.query(
    "SELECT count(*)::integer AS count FROM scene_renders WHERE story_id = $1 AND status = 'ready'", [storyId],
  )).rows[0].count as number;
  assert.ok(readyBeforeRetry >= 3 && readyBeforeRetry < 30);
  const retried = await queue.enqueue({ id: randomUUID(), profileId, storyId, manifestHash: "9".repeat(64), manifest });
  assert.equal(retried?.id, exportId);
  assert.equal((await pool.query(
    "SELECT count(*)::integer AS count FROM scene_renders WHERE story_id = $1 AND status = 'ready'", [storyId],
  )).rows[0].count, readyBeforeRetry);
  assert.equal((await pool.query(
    "SELECT count(*)::integer AS count FROM scene_renders WHERE story_id = $1 AND status = 'queued'", [storyId],
  )).rows[0].count, 30 - readyBeforeRetry);
  assert.equal((await pool.query("SELECT status FROM scene_renders WHERE id = $1", [failedId])).rows[0].status, "queued");
});

function exportManifest(sceneIds: readonly string[]): StoryExportManifest {
  return {
    version: 1, storyRevision: 7, timelineHash: "a".repeat(64), outputProfileId: "vertical-social-v1",
    frameRate: { numerator: 30, denominator: 1 }, totalFrames: 300,
    approvedMix: { storageKey: "mix.m4a", contentHash: "b".repeat(64), durationFrames: 300 },
    segments: sceneIds.map((sceneId, position) => ({
      position, sceneId, durationFrames: 150, inputHash: (position + 1).toString(16).padStart(64, "0"),
      input: {
        artifact: "story-export-segment", rendererId: "still-image", rendererVersion: 1,
        material: { storageKey: `${sceneId}.png`, name: `${sceneId}.png`, mimeType: "image/png", width: 1080, height: 1920, orientation: "portrait" },
        durationSeconds: 5, motion: "none", focusPoint: { x: .5, y: .5 },
        output: { width: 1080, height: 1920, fps: 30, codec: "h264", profileId: "vertical-social-v1",
          frameRate: { numerator: 30, denominator: 1 }, durationFrames: 150 },
      },
    })),
  };
}
