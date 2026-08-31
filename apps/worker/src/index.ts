import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { PostgresSceneRenderQueue } from "@storyteller/render-queue";
import { createConfiguredObjectStorage } from "@storyteller/storage";
import { Pool } from "pg";
import { loadLocalEnvironment } from "./environment.js";
import { SceneRenderWorker } from "./scene-render-worker.js";
import { pruneOperationalHistory } from "./operational-retention.js";

loadLocalEnvironment();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString, ssl: process.env.PGSSLMODE === "disable" ? false : undefined });
const worker = new SceneRenderWorker(
  `${process.env.HOSTNAME ?? "local"}:${process.pid}:${randomUUID()}`,
  new PostgresSceneRenderQueue(pool),
  createConfiguredObjectStorage(),
);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

console.info("storyteller-worker started");
let nextRetentionRun = 0;
while (!controller.signal.aborted) {
  try {
    if (Date.now() >= nextRetentionRun) {
      nextRetentionRun = Date.now() + 24 * 60 * 60 * 1_000;
      await pruneOperationalHistory(pool);
    }
    if (!await worker.runOnce()) await setTimeout(750, undefined, { signal: controller.signal });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error("worker iteration failed", error);
      await setTimeout(2_000, undefined, { signal: controller.signal }).catch(() => undefined);
    }
  }
}
await pool.end();
