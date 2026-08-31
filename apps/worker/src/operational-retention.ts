import type { Pool } from "pg";

export const operationalRetentionDays = 90;

export async function pruneOperationalHistory(pool: Pool, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - operationalRetentionDays * 24 * 60 * 60 * 1_000);
  const client = await pool.connect();
  const queryable = client;
  try {
    await client.query("BEGIN");
    await queryable.query("DELETE FROM product_activity_events WHERE occurred_at < $1", [cutoff]);
    await queryable.query(`DELETE FROM sessions
      WHERE (revoked_at IS NOT NULL AND revoked_at < $1)
         OR (revoked_at IS NULL AND expires_at < $1)`, [cutoff]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
