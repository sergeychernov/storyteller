import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AccessControlService } from "@storyteller/application";
import { PostgresAccessRepository } from "./access-control-database.js";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";

test("PostgreSQL: access assignments resolve deterministically and every manual change is audited", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const profileId = randomUUID();
  await pool.query(
    "INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Access', 'access@example.test', 'hash')",
    [profileId],
  );
  const accessControl = new AccessControlService(new PostgresAccessRepository(pool), () => new Date("2026-08-29T12:00:00.000Z"));

  const baseline = await accessControl.resolve(profileId);
  assert.equal(baseline.planVersionCode, "free-v1");
  assert.deepEqual(baseline.roles, ["creator"]);
  assert.equal(capability(baseline, "story.create").allowed, true);
  assert.equal(capability(baseline, "admin.console.access").allowed, false);
  assert.equal(limit(baseline, "limit.stories.active").value, 3);

  await pool.query(
    `INSERT INTO access_cohort_memberships (profile_id, cohort_code, expires_at, reason, created_by)
     VALUES ($1, 'early_users', '2026-10-01T00:00:00Z', 'early access fixture', $1)`,
    [profileId],
  );
  await pool.query(
    `INSERT INTO access_capability_assignments (cohort_code, capability_code, effect, expires_at, reason, created_by)
     VALUES ('early_users', 'studio.timeline.access', 'allow', '2026-11-01T00:00:00Z', 'timeline fixture', $1)`,
    [profileId],
  );
  await pool.query(
    `INSERT INTO access_limit_assignments (cohort_code, limit_code, operation, value, reason, created_by)
     VALUES ('early_users', 'limit.story_exports.month', 'add', 10, 'export bonus', $1)`,
    [profileId],
  );
  const cohortAccess = await accessControl.resolve(profileId);
  assert.equal(capability(cohortAccess, "studio.timeline.access").allowed, true);
  assert.equal(capability(cohortAccess, "studio.timeline.access").expiresAt, "2026-10-01T00:00:00.000Z");
  assert.equal(limit(cohortAccess, "limit.story_exports.month").value, 13);

  const denied = await pool.query<{ id: string }>(
    `INSERT INTO access_capability_assignments (profile_id, capability_code, effect, reason, created_by)
     VALUES ($1, 'story.create', 'deny', 'support hold', $1) RETURNING id`,
    [profileId],
  );
  await pool.query(
    `INSERT INTO access_role_assignments (profile_id, role_code, reason, created_by)
     VALUES ($1, 'access_manager', 'internal operator', $1)`,
    [profileId],
  );
  const overridden = await accessControl.resolve(profileId);
  assert.equal(capability(overridden, "story.create").allowed, false);
  assert.equal(capability(overridden, "admin.console.access").allowed, true);
  assert.deepEqual(overridden.roles, ["creator", "access_manager"]);

  await pool.query("DELETE FROM access_capability_assignments WHERE id = $1", [denied.rows[0]!.id]);
  assert.equal(capability(await accessControl.resolve(profileId), "story.create").allowed, true);
  const audit = await pool.query<{ action: string; entity_type: string; reason: string }>(
    "SELECT action, entity_type, reason FROM access_audit_log ORDER BY id",
  );
  assert.deepEqual(audit.rows.map(({ action, entity_type }) => ({ action, entity_type })), [
    { action: "insert", entity_type: "access_cohort_memberships" },
    { action: "insert", entity_type: "access_capability_assignments" },
    { action: "insert", entity_type: "access_limit_assignments" },
    { action: "insert", entity_type: "access_capability_assignments" },
    { action: "insert", entity_type: "access_role_assignments" },
    { action: "delete", entity_type: "access_capability_assignments" },
  ]);
  assert.equal(audit.rows.at(-1)?.reason, "support hold");

  await assert.rejects(pool.query(
    `INSERT INTO access_capability_assignments (profile_id, capability_code, effect, reason)
     VALUES ($1, 'story.create', 'allow', '')`,
    [profileId],
  ), { code: "23514" });
  await pool.query("INSERT INTO access_plan_versions (code, plan_key, version) VALUES ('future-v1', 'future', 1)");
  await assert.rejects(pool.query(
    `INSERT INTO access_capability_assignments (plan_version_code, capability_code, effect, reason)
     VALUES ('future-v1', 'story.create', 'deny', 'invalid plan deny')`,
  ), { code: "23514" });
  await assert.rejects(pool.query(
    `INSERT INTO access_role_assignments (plan_version_code, profile_id, role_code, reason)
     VALUES ('future-v1', $1, 'creator', 'ambiguous subject')`,
    [profileId],
  ), { code: "23514" });
  await assert.rejects(pool.query("UPDATE access_capabilities SET code = 'story.create.renamed' WHERE code = 'story.create'"), {
    code: "P0001",
  });
  await assert.rejects(pool.query(
    "UPDATE access_role_assignments SET reason = 'changed' WHERE plan_version_code = 'free-v1'",
  ), { code: "P0001" });
  await pool.query(
    "INSERT INTO access_role_assignments (plan_version_code, role_code, reason) VALUES ('future-v1', 'creator', 'future fixture')",
  );
  await pool.query("UPDATE access_plan_versions SET locked_at = now() WHERE code = 'future-v1'");
  await assert.rejects(pool.query(
    "UPDATE access_role_assignments SET reason = 'changed' WHERE plan_version_code = 'future-v1'",
  ), { code: "P0001" });
});

function capability(access: Awaited<ReturnType<AccessControlService["resolve"]>>, code: string) {
  const value = access.capabilities.find(({ code: candidate }) => candidate === code);
  assert.ok(value, `missing capability ${code}`);
  return value;
}

function limit(access: Awaited<ReturnType<AccessControlService["resolve"]>>, code: string) {
  const value = access.limits.find(({ code: candidate }) => candidate === code);
  assert.ok(value, `missing limit ${code}`);
  return value;
}
