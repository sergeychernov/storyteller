import { createPostgresRepository } from "./database.js";
import { loadLocalEnvironment } from "./environment.js";
import { migrateDatabase } from "./migrations.js";

loadLocalEnvironment();
const { pool } = createPostgresRepository();
try { await migrateDatabase(pool); } finally { await pool.end(); }
