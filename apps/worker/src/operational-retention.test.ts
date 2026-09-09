import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { exportSegmentRetentionDays } from "@storyteller/render-queue";
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
  assert.deepEqual(queries.map(({ text }) => text.trim().split(/\s+/, 2).join(" ")), ["BEGIN", "DELETE FROM", "DELETE FROM", "DELETE FROM", "WITH expired", "DELETE FROM", "COMMIT"]);
  assert.equal((queries[1]?.values?.[0] as Date).toISOString(), "2026-06-02T12:00:00.000Z");
  assert.match(queries[2]!.text, /revoked_at IS NOT NULL/);
  assert.match(queries[2]!.text, /revoked_at IS NULL AND expires_at/);
  assert.equal((queries[3]?.values?.[0] as Date).toISOString(), "2026-08-30T12:00:00.000Z");

  assert.equal(exportSegmentRetentionDays, 7);
  assert.equal((queries[4]?.values?.[0] as Date).toISOString(), "2026-08-24T12:00:00.000Z");
  assert.match(queries[4]!.text, /story-export-segment/);
  assert.match(queries[4]!.text, /export.status IN \('queued', 'assembling'\)/);
  assert.match(queries[4]!.text, /INSERT INTO object_deletion_jobs/);
});
