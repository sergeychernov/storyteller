import { Pool } from "pg";
import { loadLocalEnvironment } from "./environment.js";
import { migrateDatabase } from "./migrations.js";

loadLocalEnvironment();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
// A release command needs only database access, not API credentials or storage.
const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
  connectionTimeoutMillis: 10_000,
  lock_timeout: 10_000,
  statement_timeout: 60_000,
});
try {
  await migrateDatabase(pool);
  console.info("Database migrations applied successfully.");
} finally {
  await pool.end();
}
