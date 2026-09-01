import assert from "node:assert/strict";
import test from "node:test";
import { AccessControlService, ApplicationError, StoryApplication } from "@storyteller/application";
import type { Pool } from "pg";
import { AdminAccessService } from "./admin-access.js";
import { PostgresAccessRepository } from "./access-control-database.js";
import { AdminReadModel } from "./admin-database.js";
import { PostgresStoryRepository } from "./database.js";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";
import { buildApi } from "./server.js";

test("PostgreSQL: preview/apply is atomic, revisioned, audited, and protects the last manager", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const application = new StoryApplication(new PostgresStoryRepository(pool, Buffer.alloc(32)));
  const admin = await application.register({ name: "Admin", email: "b15-admin@example.test", password: "long-test-password" });
  const first = await application.register({ name: "First", email: "b15-first@example.test", password: "long-test-password" });
  const second = await application.register({ name: "Second", email: "b15-second@example.test", password: "long-test-password" });
  await pool.query(
    "INSERT INTO access_role_assignments (profile_id, role_code, reason, created_by) VALUES ($1, 'access_manager', 'test manager', $1)",
    [admin.profile.id],
  );
  const clock = () => new Date("2026-09-01T12:00:00.000Z");
  const service = new AdminAccessService(pool, clock);
  const accessControl = new AccessControlService(new PostgresAccessRepository(pool), clock);
  const api = await buildApi(application, {
    accessControl, adminReadModel: new AdminReadModel(pool), adminAccessService: service,
  });
  context.after(() => api.close());
  const origin = "http://localhost:3004";
  const signIn = await api.inject({
    method: "POST", url: "/auth/browser/sign-in", headers: { origin },
    payload: { email: "b15-admin@example.test", password: "long-test-password" },
  });
  const cookie = cookieHeader(signIn.headers["set-cookie"]);
  const csrf = signIn.json<{ csrfToken: string }>().csrfToken;
  const routePayload = {
    profileIds: [second.profile.id], operation: { type: "set_role", roleCode: "access_manager" }, reason: "route test",
  };
  assert.equal((await api.inject({
    method: "POST", url: "/admin/access/previews", headers: { cookie, origin }, payload: routePayload,
  })).statusCode, 403);
  const routePreview = await api.inject({
    method: "POST", url: "/admin/access/previews", headers: { cookie, origin, "x-csrf-token": csrf }, payload: routePayload,
  });
  assert.equal(routePreview.statusCode, 200, routePreview.body);
  assert.equal(routePreview.json<{ targetCount: number }>().targetCount, 1);

  const deny = await service.preview(admin.profile.id, {
    profileIds: [first.profile.id],
    operation: { type: "set_capability_override", capabilityCode: "story.create", effect: "deny" },
    reason: "support hold",
  });
  assert.equal(deny.applicable, true);
  assert.equal(deny.changedCount, 1);
  assert.equal(deny.targets[0]?.before?.capabilities.find(({ code }) => code === "story.create")?.allowed, true);
  assert.equal(deny.targets[0]?.after?.capabilities.find(({ code }) => code === "story.create")?.allowed, false);
  await service.apply(admin.profile.id, deny.id);

  const audit = (await pool.query<{ actor_profile_id: string; target_profile_id: string; reason: string; batch_id: string }>(
    "SELECT actor_profile_id, target_profile_id, reason, batch_id FROM access_audit_log WHERE batch_id = $1",
    [deny.id],
  )).rows[0];
  assert.deepEqual(audit, {
    actor_profile_id: admin.profile.id, target_profile_id: first.profile.id, reason: "support hold", batch_id: deny.id,
  });
  await assert.rejects(pool.query("DELETE FROM access_audit_log WHERE batch_id = $1", [deny.id]), { code: "P0001" });

  const stale = await service.preview(admin.profile.id, {
    profileIds: [first.profile.id], operation: { type: "remove_capability_override", capabilityCode: "story.create" }, reason: "release hold",
  });
  await pool.query(
    `INSERT INTO access_limit_assignments (profile_id, limit_code, operation, value, reason, created_by)
     VALUES ($1, 'limit.story_exports.month', 'add', 1, 'concurrent change', $2)`,
    [first.profile.id, admin.profile.id],
  );
  await assert.rejects(service.apply(admin.profile.id, stale.id), (error: unknown) => applicationError(error, "access_preview_stale"));

  const bulk = await service.preview(admin.profile.id, {
    profileIds: [first.profile.id, second.profile.id],
    operation: { type: "set_role", roleCode: "access_manager", expiresAt: "2026-10-01T00:00:00.000Z" },
    reason: "temporary support rotation",
  });
  await assert.rejects(service.apply(admin.profile.id, bulk.id), (error: unknown) => applicationError(error, "bulk_confirmation_required"));
  const applied = await service.apply(admin.profile.id, bulk.id, "APPLY 2");
  assert.equal(applied.changedCount, 2);
  await assert.rejects(service.apply(admin.profile.id, bulk.id, "APPLY 2"), (error: unknown) => applicationError(error, "access_preview_consumed"));

  const oneShot = await service.preview(first.profile.id, {
    profileIds: [first.profile.id],
    operation: { type: "set_cohort_membership", cohortCode: "early_users" }, reason: "one-shot concurrency",
  });
  const oneShotRace = await Promise.allSettled([
    service.apply(first.profile.id, oneShot.id), service.apply(first.profile.id, oneShot.id),
  ]);
  assert.equal(oneShotRace.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(oneShotRace.filter(({ status }) => status === "rejected").length, 1);

  const demoteOriginal = await service.preview(first.profile.id, {
    profileIds: [admin.profile.id], operation: { type: "remove_role", roleCode: "access_manager" }, reason: "handoff manager",
  });
  await service.apply(first.profile.id, demoteOriginal.id);
  const removeSecond = await service.preview(first.profile.id, {
    profileIds: [second.profile.id], operation: { type: "remove_role", roleCode: "access_manager" }, reason: "parallel manager change",
  });
  const removeFirst = await service.preview(second.profile.id, {
    profileIds: [first.profile.id], operation: { type: "remove_role", roleCode: "access_manager" }, reason: "parallel manager change",
  });
  const managerRace = await Promise.allSettled([
    service.apply(first.profile.id, removeSecond.id), service.apply(second.profile.id, removeFirst.id),
  ]);
  assert.equal(managerRace.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(managerRace.filter(({ status }) => status === "rejected").length, 1);
  const remainingManagers = await Promise.all([first.profile.id, second.profile.id].map(async (profileId) => (
    await accessControl.resolve(profileId)).roles.includes("access_manager")));
  assert.equal(remainingManagers.filter(Boolean).length, 1);

  const survivingManager = remainingManagers[0] ? first.profile.id : second.profile.id;
  const selfDemotion = await service.preview(survivingManager, {
    profileIds: [survivingManager], operation: { type: "remove_role", roleCode: "access_manager" }, reason: "unsafe self demotion",
  });
  assert.equal(selfDemotion.applicable, false);
  assert.ok(selfDemotion.targets[0]?.blockers.includes("self_lockout_prevented"));
  await assert.rejects(service.apply(survivingManager, selfDemotion.id), (error: unknown) => applicationError(error, "access_preview_blocked"));
});

test("PostgreSQL: manager viability ignores profiles that cannot hold the manager role", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const application = new StoryApplication(new PostgresStoryRepository(pool, Buffer.alloc(32)));
  const admin = await application.register({ name: "Admin", email: "manager-scan-admin@example.test", password: "long-test-password" });
  const target = await application.register({ name: "Target", email: "manager-scan-target@example.test", password: "long-test-password" });
  await pool.query(
    "INSERT INTO access_role_assignments (profile_id, role_code, reason, created_by) VALUES ($1, 'access_manager', 'test manager', $1)",
    [admin.profile.id],
  );
  await pool.query(`
    INSERT INTO profiles (id, name, email, password_hash)
    SELECT gen_random_uuid(), 'Unrelated ' || value, 'unrelated-' || value || '@example.test', 'unused-test-hash'
    FROM generate_series(1, 250) value`);

  const measured = queryCountingPool(pool);
  const service = new AdminAccessService(measured.pool, () => new Date("2026-09-01T12:00:00.000Z"));
  const preview = await service.preview(admin.profile.id, {
    profileIds: [target.profile.id],
    operation: { type: "set_capability_override", capabilityCode: "story.create", effect: "deny" },
    reason: "manager scan regression",
  });

  assert.equal(preview.applicable, true);
  assert.ok(measured.queryCount() < 60, `preview executed ${measured.queryCount()} queries`);
  assert.equal(measured.statements().some((sql) => sql.trim() === "SELECT id FROM profiles ORDER BY id"), false);
  assert.ok(measured.statements().some((sql) => sql.includes("manager_profiles")));
});

test("PostgreSQL: admin revokes a safe session UUID but never its current session", options, async (context) => {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const application = new StoryApplication(new PostgresStoryRepository(pool, Buffer.alloc(32)));
  const admin = await application.register({ name: "Admin", email: "session-admin@example.test", password: "long-test-password" });
  const user = await application.register({ name: "User", email: "session-user@example.test", password: "long-test-password" });
  const adminSession = await application.authenticateSession(admin.accessToken);
  const userSession = await application.authenticateSession(user.accessToken);
  const clock = () => new Date("2026-09-01T12:00:00.000Z");
  const service = new AdminAccessService(pool, clock);

  await assert.rejects(
    service.revokeSession(admin.profile.id, adminSession.id, admin.profile.id, adminSession.id, "self revoke"),
    (error: unknown) => applicationError(error, "self_session_revoke_prevented"),
  );
  assert.deepEqual(await service.revokeSession(
    admin.profile.id, adminSession.id, user.profile.id, userSession.id, "security response",
  ), { id: userSession.id, revokedAt: "2026-09-01T12:00:00.000Z" });
  await assert.rejects(application.authenticateSession(user.accessToken), { statusCode: 401 });
  await assert.rejects(
    service.revokeSession(admin.profile.id, adminSession.id, user.profile.id, userSession.id, "repeat"),
    (error: unknown) => applicationError(error, "session_not_active"),
  );
  const body = JSON.stringify((await pool.query("SELECT * FROM admin_audit_log WHERE action = 'users.sessions.revoke'")).rows);
  assert.doesNotMatch(body, /token|hash/i);
});

function applicationError(error: unknown, code: string): boolean {
  assert.ok(error instanceof ApplicationError);
  assert.equal(error.code, code);
  return true;
}

function cookieHeader(value: string | string[] | undefined): string {
  const cookies = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

function queryCountingPool(pool: Pool): {
  readonly pool: Pool;
  readonly queryCount: () => number;
  readonly statements: () => readonly string[];
} {
  let count = 0;
  const statements: string[] = [];
  const measuredPool = {
    connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === "query") return (...arguments_: unknown[]) => {
            count++;
            if (typeof arguments_[0] === "string") statements.push(arguments_[0]);
            return Reflect.apply(target.query, target, arguments_);
          };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  } as unknown as Pool;
  return { pool: measuredPool, queryCount: () => count, statements: () => statements };
}
