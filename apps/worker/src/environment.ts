import { loadEnvFile } from "node:process";
import { availableParallelism } from "node:os";

const rootEnvFile = new URL("../../../.env", import.meta.url);

export function loadLocalEnvironment(): void {
  try {
    loadEnvFile(rootEnvFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function storyExportSegmentConcurrency(
  configured = process.env.STORY_EXPORT_SEGMENT_CONCURRENCY,
  available = availableParallelism(),
): number {
  const fallback = Math.max(1, Math.min(available || 1, 4));
  if (!configured?.trim()) return fallback;
  const parsed = Number(configured);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 32) : fallback;
}
