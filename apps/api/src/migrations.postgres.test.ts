import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Pool } from "pg";
import { migrateDatabase, migrations } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";

const execute = promisify(execFile);

test("PostgreSQL: release migration works on a fresh database, concurrently and repeatedly without API credentials", options, async (context) => {
  const { pool, connectionString } = await createPostgresTestPool(context);
  await Promise.all([runReleaseMigration(connectionString), runReleaseMigration(connectionString)]);
  const applied = (await pool.query("SELECT version, applied_at FROM schema_migrations ORDER BY version")).rows;
  assert.deepEqual(applied.map(({ version }) => version), migrations.map(({ version }) => version));
  await runReleaseMigration(connectionString);
  assert.deepEqual((await pool.query("SELECT version, applied_at FROM schema_migrations ORDER BY version")).rows, applied);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM scene_renders")).rows[0].count, 0);
});

test("PostgreSQL: migrations 4–12 preserve legacy rows, baseline access, and old API/worker writes", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await applyVersion3(pool);
  const profileId = randomUUID(), storyId = randomUUID(), sceneId = randomUUID(), renderId = randomUUID();
  const payload = { id: storyId, profileId, revision: 1, scenes: [{ id: sceneId, materials: [] }] };
  await pool.query("INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Legacy', 'legacy@example.test', 'hash')", [profileId]);
  await pool.query("INSERT INTO sessions (token_hash, profile_id, expires_at, created_at) VALUES ($1, $2, '2027-01-01T00:00:00Z', '2026-01-01T00:00:00Z')", ["a".repeat(64), profileId]);
  await pool.query(
    "INSERT INTO stories (id, profile_id, title, status, scene_count, payload) VALUES ($1, $2, 'Legacy story', 'draft', 1, $3)",
    [storyId, profileId, payload],
  );
  // These queries deliberately match the old protocol, which knows no content_hash.
  const oldInsert = `INSERT INTO scene_renders (id, profile_id, story_id, scene_id, input_hash, input, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'queued')`;
  await pool.query(oldInsert, [renderId, profileId, storyId, sceneId, "a".repeat(64), { rendererVersion: 1 }]);
  await pool.query("UPDATE scene_renders SET status = 'ready', storage_key = 'legacy.mp4', size_bytes = 100 WHERE id = $1", [renderId]);
  const before = (await pool.query("SELECT * FROM scene_renders WHERE id = $1", [renderId])).rows[0];

  await migrateDatabase(pool);
  assert.equal((await pool.query("SELECT language FROM profiles WHERE id = $1", [profileId])).rows[0].language, "en");
  assert.equal((await pool.query("SELECT access_plan_version_code FROM profiles WHERE id = $1", [profileId])).rows[0].access_plan_version_code, "free-v1");
  assert.equal(Number((await pool.query("SELECT access_revision FROM profiles WHERE id = $1", [profileId])).rows[0].access_revision), 0);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM access_roles")).rows[0].count, 2);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM access_capabilities")).rows[0].count, 35);
  const migratedSession = (await pool.query("SELECT id, last_seen_at, revoked_at FROM sessions WHERE token_hash = $1", ["a".repeat(64)])).rows[0];
  assert.match(migratedSession.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(migratedSession.last_seen_at).toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(migratedSession.revoked_at, null);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM product_activity_event_types")).rows[0].count, 11);
  await assert.rejects(pool.query("UPDATE profiles SET language = 'unsupported' WHERE id = $1", [profileId]), { code: "23514" });
  assert.deepEqual((await pool.query("SELECT * FROM scene_renders WHERE id = $1", [renderId])).rows[0], {
    ...before, content_hash: null, progress_percent: 100, progress_phase: "ready", render_slot: "scene-render:video",
  });
  assert.deepEqual((await pool.query("SELECT payload FROM stories WHERE id = $1", [storyId])).rows[0].payload, payload);
  const nextId = randomUUID();
  await pool.query(oldInsert, [nextId, profileId, storyId, sceneId, "b".repeat(64), { rendererVersion: 1 }]);
  await pool.query("UPDATE scene_renders SET status = 'ready', storage_key = 'old-worker.mp4', size_bytes = 200 WHERE id = $1", [nextId]);
  assert.equal((await pool.query("SELECT content_hash FROM scene_renders WHERE id = $1", [nextId])).rows[0].content_hash, null);
  await pool.query("UPDATE scene_renders SET content_hash = $2 WHERE id = $1", [nextId, "c".repeat(64)]);
  await assert.rejects(pool.query("UPDATE scene_renders SET content_hash = 'invalid' WHERE id = $1", [nextId]), { code: "23514" });
  assert.equal((await pool.query("SELECT content_hash FROM scene_renders WHERE id = $1", [nextId])).rows[0].content_hash, "c".repeat(64));
  assert.equal((await pool.query("SELECT render_slot FROM scene_renders WHERE id = $1", [nextId])).rows[0].render_slot, "scene-render:video");
});

test("PostgreSQL: migration 9 retains only the latest result in each output slot", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await applyThroughVersion(pool, 8);
  const profileId = randomUUID(), storyId = randomUUID(), sceneId = randomUUID();
  await pool.query("INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Retention', 'retention@example.test', 'hash')", [profileId]);
  await pool.query(
    "INSERT INTO stories (id, profile_id, title, status, scene_count, payload) VALUES ($1, $2, 'Retention', 'draft', 1, $3)",
    [storyId, profileId, { id: storyId, profileId, revision: 1, scenes: [{ id: sceneId, materials: [] }] }],
  );
  const rows = [
    [randomUUID(), "a".repeat(64), { rendererId: "still-image" }, "old.mp4", "2026-01-01T00:00:00Z"],
    [randomUUID(), "b".repeat(64), { rendererId: "still-image" }, "latest.mp4", "2026-01-02T00:00:00Z"],
    [randomUUID(), "c".repeat(64), { rendererId: "video", mode: "audio" }, "audio.m4a", "2026-01-01T00:00:00Z"],
    [randomUUID(), "d".repeat(64), { rendererId: "still-image", artifact: "scene-frame" }, "frame.png", "2026-01-01T00:00:00Z"],
  ] as const;
  for (const [id, inputHash, input, storageKey, createdAt] of rows) await pool.query(
    `INSERT INTO scene_renders
      (id, profile_id, story_id, scene_id, input_hash, input, status, storage_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ready', $7, $8)`,
    [id, profileId, storyId, sceneId, inputHash, input, storageKey, createdAt],
  );

  await migrateDatabase(pool);

  assert.deepEqual((await pool.query("SELECT render_slot, storage_key FROM scene_renders ORDER BY render_slot")).rows, [
    { render_slot: "scene-frame", storage_key: "frame.png" },
    { render_slot: "scene-render:audio", storage_key: "audio.m4a" },
    { render_slot: "scene-render:video", storage_key: "latest.mp4" },
  ]);
  assert.deepEqual((await pool.query("SELECT storage_key FROM object_deletion_jobs")).rows, [{ storage_key: "old.mp4" }]);
});

test("PostgreSQL: migration 7 grants the requested existing profile access_manager exactly once", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await applyThroughVersion(pool, 6);
  const targetProfileId = randomUUID(), otherProfileId = randomUUID();
  await pool.query(
    `INSERT INTO profiles (id, name, email, password_hash) VALUES
      ($1, 'Target', 'Chernov.Sergey@Gmail.com', 'hash'),
      ($2, 'Other', 'other@example.test', 'hash')`,
    [targetProfileId, otherProfileId],
  );
  await pool.query(
    `INSERT INTO access_role_assignments
      (profile_id, role_code, starts_at, expires_at, reason)
     VALUES ($1, 'access_manager', '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z', 'expired fixture')`,
    [targetProfileId],
  );

  const migration7 = migrations.find(({ version }) => version === 7)!;
  await pool.query(migration7.sql);
  await pool.query("INSERT INTO schema_migrations (version) VALUES (7)");
  await pool.query(migration7.sql);

  const assignments = await pool.query<{ profile_id: string; role_code: string; reason: string }>(
    `SELECT profile_id, role_code, reason FROM access_role_assignments
     WHERE profile_id IN ($1, $2)
       AND (starts_at IS NULL OR starts_at <= now())
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY profile_id`,
    [targetProfileId, otherProfileId],
  );
  assert.deepEqual(assignments.rows, [{
    profile_id: targetProfileId,
    role_code: "access_manager",
    reason: "bootstrap initial access manager requested by product owner",
  }]);
  const audit = await pool.query<{ action: string; entity_type: string; reason: string }>(
    `SELECT action, entity_type, reason FROM access_audit_log
     WHERE new_data->>'profile_id' = $1
       AND reason = 'bootstrap initial access manager requested by product owner'`,
    [targetProfileId],
  );
  assert.deepEqual(audit.rows, [{
    action: "insert",
    entity_type: "access_role_assignments",
    reason: "bootstrap initial access manager requested by product owner",
  }]);
  await assert.rejects(migrateDatabase(pool), /manual access assignments contain duplicates/);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM schema_migrations WHERE version = 11")).rows[0].count, 0);
  await pool.query("DELETE FROM access_role_assignments WHERE reason = 'expired fixture'");
  await migrateDatabase(pool);
  await migrateDatabase(pool);
});

test("PostgreSQL: a failed release migration exits nonzero, rolls back DDL and can be retried", options, async (context) => {
  const { pool, connectionString } = await createPostgresTestPool(context);
  await applyVersion3(pool);
  // Fail after the ALTER TABLE, when recording its version, to check atomicity.
  await pool.query(`CREATE FUNCTION reject_migration() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated migration failure'; END $$;
    CREATE TRIGGER reject_migration BEFORE INSERT ON schema_migrations
    FOR EACH ROW EXECUTE FUNCTION reject_migration();`);
  await assert.rejects(runReleaseMigration(connectionString), (error: unknown) => {
    assert.ok(error instanceof Error && "code" in error && "stderr" in error);
    assert.equal(error.code, 1);
    assert.match(String(error.stderr), /simulated migration failure/);
    return true;
  });
  assert.deepEqual((await pool.query("SELECT version FROM schema_migrations ORDER BY version")).rows, [{ version: 1 }, { version: 2 }, { version: 3 }]);
  assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'scene_renders' AND column_name = 'content_hash'`)).rows[0].count, 0);
  await pool.query("DROP TRIGGER reject_migration ON schema_migrations");
  await runReleaseMigration(connectionString);
  assert.deepEqual((await pool.query("SELECT version FROM schema_migrations ORDER BY version")).rows, migrations.map(({ version }) => ({ version })));
});

async function applyVersion3(pool: Pool) {
  await applyThroughVersion(pool, 3);
}

async function applyThroughVersion(pool: Pool, version: number) {
  await pool.query("CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const migration of migrations.filter((migration) => migration.version <= version)) {
    await pool.query(migration.sql);
    await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
  }
}

function runReleaseMigration(connectionString: string) {
  return execute(process.execPath, [fileURLToPath(new URL("./migrate.js", import.meta.url))], {
    env: { ...process.env, DATABASE_URL: connectionString, PLATFORM_CREDENTIALS_KEY: "", PGSSLMODE: "disable" },
    timeout: 15_000,
  });
}
