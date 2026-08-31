import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { operationalRetentionDays, pruneOperationalHistory } from "./operational-retention.js";

test("operational retention prunes activity and only completed old sessions at 90 days", async () => {
  const queries: { readonly text: string; readonly values?: readonly unknown[] }[] = [];
  const client = {
    query: async (text: string, values?: readonly unknown[]) => { queries.push({ text, ...(values ? { values } : {}) }); return { rowCount: 0, rows: [] }; },
    release: () => undefined,
  };
  const pool = { connect: async () => client } as unknown as Pool;
  await pruneOperationalHistory(pool, new Date("2026-08-31T12:00:00.000Z"));

  assert.equal(operationalRetentionDays, 90);
  assert.deepEqual(queries.map(({ text }) => text.trim().split(/\s+/, 2).join(" ")), ["BEGIN", "DELETE FROM", "DELETE FROM", "COMMIT"]);
  assert.equal((queries[1]?.values?.[0] as Date).toISOString(), "2026-06-02T12:00:00.000Z");
  assert.match(queries[2]!.text, /revoked_at IS NOT NULL/);
  assert.match(queries[2]!.text, /revoked_at IS NULL AND expires_at/);
});
