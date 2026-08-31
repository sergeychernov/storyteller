import assert from "node:assert/strict";
import test from "node:test";
import { AccessControlService, StoryApplication } from "@storyteller/application";
import { PostgresAccessRepository } from "./access-control-database.js";
import { AdminReadModel } from "./admin-database.js";
import { PostgresStoryRepository } from "./database.js";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";
import { buildApi } from "./server.js";

test("PostgreSQL: Admin reads are capability-gated, audited, paginated, and leak no session secrets", options, async (context) => {
  process.env.NODE_ENV = "test";
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const repository = new PostgresStoryRepository(pool, Buffer.alloc(32));
  const application = new StoryApplication(repository);
  const administrator = await application.register({ name: "Administrator", email: "admin@example.test", password: "long-test-password", language: "ru" });
  const ordinary = await application.register({ name: "Ordinary", email: "ordinary@example.test", password: "long-test-password" });
  await application.createStory(ordinary.profile.id, { title: "Must never appear in Admin" });
  await pool.query(
    "INSERT INTO access_role_assignments (profile_id, role_code, reason, created_by) VALUES ($1, 'access_manager', 'admin test', $1)",
    [administrator.profile.id],
  );
  const accessControl = new AccessControlService(new PostgresAccessRepository(pool));
  const api = await buildApi(application, { accessControl, adminReadModel: new AdminReadModel(pool) });
  context.after(() => api.close());
  const origin = "http://localhost:3004";

  const adminSignIn = await api.inject({
    method: "POST", url: "/auth/browser/sign-in", headers: { origin },
    payload: { email: "admin@example.test", password: "long-test-password" },
  });
  assert.equal(adminSignIn.statusCode, 200, adminSignIn.body);
  const adminCookie = cookieHeader(adminSignIn.headers["set-cookie"]);
  const csrfToken = adminSignIn.json<{ csrfToken: string }>().csrfToken;
  assert.equal((await api.inject({ method: "GET", url: "/admin/me", headers: { cookie: adminCookie } })).statusCode, 200);
  assert.equal((await api.inject({
    method: "POST", url: "/admin/users/search", headers: { cookie: adminCookie, origin }, payload: { page: 1, perPage: 25, sort: "createdAt", order: "DESC" },
  })).statusCode, 403);
  const users = await api.inject({
    method: "POST", url: "/admin/users/search", headers: { cookie: adminCookie, origin, "x-csrf-token": csrfToken },
    payload: { page: 1, perPage: 25, sort: "email", order: "ASC", query: "ordinary@" },
  });
  assert.equal(users.statusCode, 200, users.body);
  const serialized = users.json<{ data: unknown[]; total: number }>();
  assert.equal(serialized.total, 1);
  assert.equal(serialized.data.length, 1);
  for (const forbidden of ["password", "token", "hash", "title", "storageKey", "filename"]) {
    assert.doesNotMatch(users.body.toLowerCase(), new RegExp(forbidden.toLowerCase()));
  }

  const sessions = await api.inject({ method: "GET", url: `/admin/users/${ordinary.profile.id}/sessions`, headers: { cookie: adminCookie } });
  assert.equal(sessions.statusCode, 200, sessions.body);
  assert.equal(sessions.body.includes("token"), false);
  assert.ok(Number((await pool.query<{ count: string }>(
    "SELECT count(*) FROM admin_audit_log WHERE actor_profile_id = $1 AND action IN ('users.search', 'users.sessions.read')",
    [administrator.profile.id],
  )).rows[0]?.count) >= 2);

  const ordinarySignIn = await api.inject({
    method: "POST", url: "/auth/browser/sign-in", headers: { origin }, payload: { email: "ordinary@example.test", password: "long-test-password" },
  });
  const ordinaryCookie = cookieHeader(ordinarySignIn.headers["set-cookie"]);
  assert.equal((await api.inject({ method: "GET", url: "/admin/overview", headers: { cookie: ordinaryCookie } })).statusCode, 403);
  assert.equal((await api.inject({ method: "GET", url: "/admin/overview" })).statusCode, 401);
});

function cookieHeader(value: string | string[] | undefined): string {
  const cookies = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}
