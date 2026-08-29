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

test("PostgreSQL: migrations 4 and 5 preserve legacy rows and accept old API and worker writes", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await applyVersion3(pool);
  const profileId = randomUUID(), storyId = randomUUID(), sceneId = randomUUID(), renderId = randomUUID();
  const payload = { id: storyId, profileId, revision: 1, scenes: [{ id: sceneId, materials: [] }] };
  await pool.query("INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Legacy', 'legacy@example.test', 'hash')", [profileId]);
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
  await assert.rejects(pool.query("UPDATE profiles SET language = 'unsupported' WHERE id = $1", [profileId]), { code: "23514" });
  assert.deepEqual((await pool.query("SELECT * FROM scene_renders WHERE id = $1", [renderId])).rows[0], { ...before, content_hash: null });
  assert.deepEqual((await pool.query("SELECT payload FROM stories WHERE id = $1", [storyId])).rows[0].payload, payload);
  const nextId = randomUUID();
  await pool.query(oldInsert, [nextId, profileId, storyId, sceneId, "b".repeat(64), { rendererVersion: 1 }]);
  await pool.query("UPDATE scene_renders SET status = 'ready', storage_key = 'old-worker.mp4', size_bytes = 200 WHERE id = $1", [nextId]);
  assert.equal((await pool.query("SELECT content_hash FROM scene_renders WHERE id = $1", [nextId])).rows[0].content_hash, null);
  await pool.query("UPDATE scene_renders SET content_hash = $2 WHERE id = $1", [nextId, "c".repeat(64)]);
  await assert.rejects(pool.query("UPDATE scene_renders SET content_hash = 'invalid' WHERE id = $1", [nextId]), { code: "23514" });
  assert.equal((await pool.query("SELECT content_hash FROM scene_renders WHERE id = $1", [nextId])).rows[0].content_hash, "c".repeat(64));
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
  await pool.query("CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const migration of migrations.filter(({ version }) => version <= 3)) {
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
