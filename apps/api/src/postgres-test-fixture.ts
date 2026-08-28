import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { Pool } from "pg";

// Never fall back to DATABASE_URL: tests must explicitly select a disposable DB.
export const postgresTestOptions = { skip: !process.env.STORYTELLER_TEST_DATABASE_URL, timeout: 20_000 };

export async function createPostgresTestPool(context: TestContext) {
  const databaseUrl = process.env.STORYTELLER_TEST_DATABASE_URL;
  assert.ok(databaseUrl, "STORYTELLER_TEST_DATABASE_URL must select a disposable database");
  const schema = `storyteller_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=5000`);
  const pool = new Pool({ connectionString: isolatedUrl.href });
  context.after(async () => {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  return { pool, connectionString: isolatedUrl.href };
}
