import { createPostgresRepository } from "./database.js";
import { migrateDatabase } from "./migrations.js";

const { pool } = createPostgresRepository();
try { await migrateDatabase(pool); } finally { await pool.end(); }
