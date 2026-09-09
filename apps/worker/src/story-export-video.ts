import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { ClaimedStoryExport, StoryExportQueue } from "@storyteller/render-queue";
import { assertSegmentProfile, buildStorySilentVideo, probeVideoProfile, type MediaProcessRunner } from "@storyteller/renderer";
import { hashFileContent, type ObjectStorage } from "@storyteller/storage";
import type { RenderCapacity } from "./render-capacity.js";

/** Fetch the independent video artifact before touching segments: a fader edit needs only audio and mux. */
export async function prepareStoryExportVideo(
  job: ClaimedStoryExport, workerId: string, directory: string, queue: StoryExportQueue,
  storage: ObjectStorage, capacity: RenderCapacity, runner: MediaProcessRunner,
): Promise<string> {
  const outputPath = join(directory, "visual-master.mp4");
  const cached = await queue.findSilentVideo(job.id, workerId);
  if (cached) {
    await pipeline(await storage.open(cached.storageKey), createWriteStream(outputPath, { flags: "wx" }));
    if (await hashFileContent(outputPath) !== cached.contentHash) throw new StoryExportVideoError("segment_failed", "silent video content hash changed");
    await verifyVideo(outputPath, job, job.manifest.totalFrames, runner);
    return outputPath;
  }
  const segmentPaths = await Promise.all(job.segments.map(async (segment, index) => {
    const manifest = job.manifest.segments[index];
    if (!manifest || !segment.storageKey || !segment.contentHash) throw new StoryExportVideoError("segment_failed", "ready segment artifact is missing");
    const path = join(directory, `segment-${index}.mp4`);
    await pipeline(await storage.open(segment.storageKey), createWriteStream(path, { flags: "wx" }));
    if (await hashFileContent(path) !== segment.contentHash) throw new StoryExportVideoError("segment_failed", "segment content hash changed");
    await verifyVideo(path, job, manifest.durationFrames, runner);
    return path;
  }));
  await capacity.run(() => buildStorySilentVideo({
    segmentPaths, outputPath, frameRate: job.manifest.frameRate, totalFrames: job.manifest.totalFrames,
  }, runner));
  await verifyVideo(outputPath, job, job.manifest.totalFrames, runner);
  const contentHash = await hashFileContent(outputPath);
  const storageKey = `projects/${job.profileId}/${job.storyId}/exports/video/${randomUUID()}.mp4`;
  await storage.put(storageKey, { body: createReadStream(outputPath), contentType: "video/mp4", contentLength: (await stat(outputPath)).size });
  try {
    if (!await queue.saveSilentVideo(job.id, workerId, { storageKey, contentHash })) await storage.delete(storageKey);
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
  return outputPath;
}


export class StoryExportVideoError extends Error {
  constructor(readonly code: "segment_failed" | "segment_profile_mismatch", message: string) { super(message); }
}

async function verifyVideo(path: string, job: ClaimedStoryExport, frames: number, runner: MediaProcessRunner): Promise<void> {
  try { assertSegmentProfile(await probeVideoProfile(path, runner), job.manifest.frameRate, frames); }
  catch (error) { throw new StoryExportVideoError("segment_profile_mismatch", error instanceof Error ? error.message : "video profile mismatch"); }
}
