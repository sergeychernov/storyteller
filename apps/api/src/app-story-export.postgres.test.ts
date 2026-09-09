import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresSceneRenderQueue, PostgresStoryExportQueue, pruneExpiredExportSegments, type StoryExportManifest,
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
  const video = { storageKey: "silent-video.mp4", contentHash: "a".repeat(64) };
  assert.equal(await queue.saveSilentVideo(exportId, "wrong-worker", video), false);
  assert.equal(await queue.saveSilentVideo(exportId, "assembly", video), true);
  assert.equal(await queue.saveSilentVideo(exportId, "assembly", { ...video, storageKey: "loser.mp4" }), false);
  assert.deepEqual(await queue.findSilentVideo(exportId, "assembly"), video);
  await pool.query("UPDATE story_silent_videos SET last_used_at = now() - interval '8 days'");
  await pruneExpiredExportSegments(pool, new Date(Date.now() - 7 * 86400_000));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM story_silent_videos")).rows[0].count, 1);
  assert.equal(await queue.complete(exportId, "assembly", "master.mp4", 1_000, "e".repeat(64)), true);
  const ready = await queue.findAuthorized(profileId, storyId, exportId);
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.readySegments, 2);
  assert.deepEqual((await pool.query("SELECT code FROM product_activity_events ORDER BY id")).rows.map(({ code }) => code), [
    "story.export_requested", "story.export_ready",
  ]);
  // Segments outlive the master they built: the next export reuses whatever the story has not changed.
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM object_deletion_jobs")).rows[0].count, 0);
  assert.equal((await pool.query(
    `SELECT count(*)::integer AS count FROM scene_renders
     WHERE story_id = $1 AND status = 'ready' AND storage_key IS NOT NULL AND last_used_at IS NOT NULL`, [storyId],
  )).rows[0].count, 2);

  const staleId = randomUUID();
  await queue.enqueue({ id: staleId, profileId, storyId, manifestHash: "d".repeat(64), manifest: {
    ...manifest, levels: { ...manifest.levels, melody: 0.5 },
  } });
  assert.equal((await queue.claimAssembly("rebuild", 10_000))?.id, staleId);
  assert.deepEqual(await queue.findSilentVideo(staleId, "rebuild"), video, "fader-only manifest reuses the saved video");
  await pool.query("UPDATE stories SET revision = 8 WHERE id = $1", [storyId]);
  const stale = await queue.findAuthorized(profileId, storyId, staleId);
  assert.equal(stale?.status, "canceled");
  assert.equal(stale?.errorCode, "story_revision_changed");
  assert.equal((await pool.query(
    `SELECT count(*)::integer AS count FROM story_export_segments link JOIN scene_renders render ON render.id = link.scene_render_id
     WHERE link.export_id = $1 AND render.status IN ('queued', 'running')`, [staleId],
  )).rows[0].count, 0);
  await pool.query("UPDATE story_silent_videos SET last_used_at = now() - interval '8 days'");
  await pruneExpiredExportSegments(pool, new Date(Date.now() - 7 * 86400_000));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM story_silent_videos")).rows[0].count, 0);
  assert.equal((await pool.query("SELECT storage_key FROM object_deletion_jobs WHERE storage_key = 'silent-video.mp4'")).rowCount, 1);

});

test("PostgreSQL: segments outlive the master, drop when a scene changes and expire a week after their last use", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const profileId = randomUUID(), storyId = randomUUID();
  const sceneIds = [randomUUID(), randomUUID()];
  await pool.query(
    "INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Retention', $2, 'hash')",
    [profileId, `${profileId}@example.test`],
  );
  await pool.query(
    `INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload)
     VALUES ($1, $2, 'Retention', 'draft', 2, 7, $3)`,
    [storyId, profileId, { id: storyId, profileId, revision: 7, scenes: sceneIds.map((id) => ({ id })) }],
  );
  const queue = new PostgresStoryExportQueue(pool);
  const renderQueue = new PostgresSceneRenderQueue(pool);
  const manifest = exportManifest(sceneIds);
  const buildMaster = async (exportId: string, built: StoryExportManifest, manifestHash: string) => {
    await queue.enqueue({ id: exportId, profileId, storyId, manifestHash, manifest: built });
    for (let job; (job = await renderQueue.claim("segments", 10_000, "story-export-segment"));) {
      await renderQueue.complete(job.id, "segments", `${job.id}.mp4`, 100, "b".repeat(64));
    }
    assert.ok(await queue.claimAssembly("assembly", 10_000));
    assert.equal(await queue.complete(exportId, "assembly", `${exportId}.mp4`, 1_000, "e".repeat(64)), true);
  };
  const segmentKeys = async () => (await pool.query<{ storage_key: string }>(
    "SELECT storage_key FROM scene_renders WHERE story_id = $1 ORDER BY storage_key", [storyId],
  )).rows.map(({ storage_key }) => storage_key);
  const deletionQueue = async () => (await pool.query<{ storage_key: string }>(
    "SELECT storage_key FROM object_deletion_jobs ORDER BY storage_key",
  )).rows.map(({ storage_key }) => storage_key);

  await buildMaster(randomUUID(), manifest, "1".repeat(64));
  const built = await segmentKeys();
  assert.equal(built.length, 2);
  assert.deepEqual(await deletionQueue(), []);

  // Editing one scene changes only that segment's input hash: its render is unreachable, the other is still reused.
  const editedHash = "a".repeat(64);
  const edited: StoryExportManifest = {
    ...manifest, segments: [{ ...manifest.segments[0]!, inputHash: editedHash }, manifest.segments[1]!],
  };
  const replaced = (await pool.query<{ storage_key: string }>(
    "SELECT storage_key FROM scene_renders WHERE story_id = $1 AND input_hash = $2",
    [storyId, manifest.segments[0]!.inputHash],
  )).rows[0]!.storage_key;
  const secondId = randomUUID();
  await queue.enqueue({ id: secondId, profileId, storyId, manifestHash: "2".repeat(64), manifest: edited });
  assert.deepEqual(await deletionQueue(), [replaced]);
  assert.deepEqual((await pool.query<{ input_hash: string }>(
    "SELECT input_hash FROM scene_renders WHERE story_id = $1 ORDER BY input_hash", [storyId],
  )).rows.map(({ input_hash }) => input_hash), [editedHash, manifest.segments[1]!.inputHash].sort());

  // However old their last use, segments an unfinished export still needs stay.
  await pool.query("UPDATE scene_renders SET last_used_at = now() - interval '8 days' WHERE story_id = $1", [storyId]);
  await pruneExpiredExportSegments(pool, new Date());
  assert.equal((await segmentKeys()).length, 2);

  for (let job; (job = await renderQueue.claim("segments", 10_000, "story-export-segment"));) {
    await renderQueue.complete(job.id, "segments", `${job.id}.mp4`, 100, "b".repeat(64));
  }
  assert.ok(await queue.claimAssembly("assembly", 10_000));
  assert.equal(await queue.complete(secondId, "assembly", "second.mp4", 1_000, "f".repeat(64)), true);
  const surviving = await segmentKeys();
  await pool.query("UPDATE scene_renders SET last_used_at = now() - interval '8 days' WHERE story_id = $1", [storyId]);
  await pruneExpiredExportSegments(pool, new Date());
  assert.deepEqual(await segmentKeys(), []);
  assert.deepEqual(await deletionQueue(), [replaced, ...surviving].sort());
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
    version: 2, storyRevision: 7, timelineHash: "a".repeat(64), outputProfileId: "vertical-social-v1",
    frameRate: { numerator: 30, denominator: 1 }, totalFrames: 300,
    levels: { video: 1, rhythm: 1, melody: 1, duckedMelody: 0.3 },
    audioSegments: [],
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
