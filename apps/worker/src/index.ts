import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { PostgresSceneRenderQueue, PostgresStoryExportQueue } from "@storyteller/render-queue";
import { createConfiguredObjectStorage } from "@storyteller/storage";
import { Pool } from "pg";
import { loadLocalEnvironment, storyExportSegmentConcurrency } from "./environment.js";
import { SceneRenderWorker } from "./scene-render-worker.js";
import { StoryExportWorker } from "./story-export-worker.js";
import { pruneOperationalHistory } from "./operational-retention.js";
import { workerRenderConcurrency } from "./render-capacity.js";

loadLocalEnvironment();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString, ssl: process.env.PGSSLMODE === "disable" ? false : undefined });
const workerPrefix = `${process.env.HOSTNAME ?? "local"}:${process.pid}`;
const renderQueue = new PostgresSceneRenderQueue(pool);
const exportQueue = new PostgresStoryExportQueue(pool);
const objectStorage = createConfiguredObjectStorage();
const workers = Array.from({ length: storyExportSegmentConcurrency() }, (_, index) => new SceneRenderWorker(
  `${workerPrefix}:segment-${index}:${randomUUID()}`, renderQueue, objectStorage,
));
const interactiveWorker = new SceneRenderWorker(`${workerPrefix}:interactive:${randomUUID()}`, renderQueue, objectStorage);
const exportWorker = new StoryExportWorker(`${workerPrefix}:assembly:${randomUUID()}`, exportQueue, objectStorage);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

console.info("storyteller-worker started", {
  storyExportSegmentConcurrency: workers.length,
  workerRenderConcurrency,
});
async function runLoop(name: string, runOnce: () => Promise<boolean>) {
  while (!controller.signal.aborted) {
    try {
      if (!await runOnce()) await setTimeout(750, undefined, { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(`${name} iteration failed`, error);
        await setTimeout(2_000, undefined, { signal: controller.signal }).catch(() => undefined);
      }
    }
  }
}
async function runRetentionLoop() {
  while (!controller.signal.aborted) {
    try { await pruneOperationalHistory(pool); }
    catch (error) { if (!controller.signal.aborted) console.error("retention failed", error); }
    await setTimeout(24 * 60 * 60 * 1_000, undefined, { signal: controller.signal }).catch(() => undefined);
  }
}
await Promise.all([
  runLoop("interactive render worker", () => interactiveWorker.runOnce("interactive")),
  ...workers.map((worker, index) => runLoop(`segment worker ${index}`, () => worker.runOnce("story-export-segment"))),
  runLoop("story export worker", () => exportWorker.runOnce()),
  runRetentionLoop(),
]);
await pool.end();
