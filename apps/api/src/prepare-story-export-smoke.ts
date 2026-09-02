import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  buildStoryTimeline, defaultStoryFrameRate, framesToSeconds, normalizeFrameRate, parseFrameRate,
  type RationalFrameRate, type Story, type VideoMaterial,
} from "@storyteller/domain";
import { assertApprovedStoryMix, probeMedia, SpawnMediaProcessRunner } from "@storyteller/renderer";
import { createConfiguredObjectStorage, hashFileContent, type ObjectStorage } from "@storyteller/storage";
import { Pool } from "pg";
import { normalizeStoredStory } from "./database.js";
import { loadLocalEnvironment } from "./environment.js";
import { migrateDatabase } from "./migrations.js";
import { hashTimeline } from "./story-exports.js";

const usage = "Usage: yarn story-export:prepare-smoke <local-story-uuid>";

export async function prepareStoryExportSmoke(arguments_ = process.argv.slice(2)): Promise<void> {
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    console.info(usage);
    return;
  }
  const storyId = parseStoryId(arguments_);
  loadLocalEnvironment();
  const connectionString = requireLocalSmokeEnvironment();
  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
  });

  try {
    await migrateDatabase(pool);
    const initial = await pool.query<StoryRow>(
      "SELECT revision, payload, md5(payload::text) AS payload_hash FROM stories WHERE id = $1",
      [storyId],
    );
    const row = initial.rows[0];
    if (!row) throw new Error(`story not found: ${storyId}`);
    const storage = createConfiguredObjectStorage();
    const runner = new SpawnMediaProcessRunner();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "storyteller-export-smoke-"));
    let uploadedStorageKey: string | undefined;
    try {
      let story = normalizeStoredStory(row.payload);
      const smokePrefix = `projects/${story.profileId}/${story.id}/approved-mixes/smoke-`;
      if (story.approvedMix && !story.approvedMix.storageKey.startsWith(smokePrefix)) {
        throw new Error("story already has a non-smoke approved mix; refusing to replace it");
      }
      story = await resolveLegacyFrameRate(story, row.payload, storage, runner, temporaryDirectory);
      const timeline = buildStoryTimeline(story);
      if (!timeline.scenes.length) throw new Error("story has no scenes");
      const empty = timeline.warnings[0];
      if (empty) {
        const position = timeline.scenes.find(({ sceneId }) => sceneId === empty.sceneId)?.index ?? 0;
        throw new Error(`scene ${position + 1} is empty`);
      }
      const timelineHash = hashTimeline(story, timeline);
      const mixPath = join(temporaryDirectory, "silent-approved-mix.m4a");
      const durationSeconds = framesToSeconds(timeline.totalFrames, timeline.frameRate);
      const generated = await runner.run("ffmpeg", smokeMixFfmpegArguments(durationSeconds, mixPath));
      if (generated.exitCode !== 0) throw new Error(`could not generate smoke mix: ${generated.stderr.trim()}`);
      await assertApprovedStoryMix(mixPath, timeline.totalFrames, timeline.frameRate, runner);
      const file = await stat(mixPath);
      const contentHash = await hashFileContent(mixPath);
      uploadedStorageKey = `${smokePrefix}${timelineHash}-${randomUUID()}.m4a`;
      await storage.put(uploadedStorageKey, {
        body: createReadStream(mixPath), contentType: "audio/mp4", contentLength: file.size,
      });
      const approvedMix = {
        storageKey: uploadedStorageKey, contentHash, mimeType: "audio/mp4" as const, sizeBytes: file.size,
        sampleRate: 48_000 as const, channels: 2 as const, timelineHash, durationFrames: timeline.totalFrames,
      };
      const saved = await saveApprovedMix(pool, story, approvedMix, row.revision, row.payload_hash);
      if (!saved) throw new Error("story changed while the smoke mix was being prepared; run the command again");
      const previousSmokeKey = story.approvedMix?.storageKey;
      if (previousSmokeKey?.startsWith(smokePrefix) && previousSmokeKey !== uploadedStorageKey) {
        await storage.delete(previousSmokeKey).catch(() => undefined);
      }
      console.info("Silent smoke mix approved for local story export.", {
        storyId: story.id,
        revision: story.revision,
        frameRate: `${timeline.frameRate.numerator}/${timeline.frameRate.denominator}`,
        totalFrames: timeline.totalFrames,
        durationSeconds: Number(durationSeconds.toFixed(6)),
      });
      console.info("Reload Story Preview and select ‘Build master’. The resulting master intentionally contains silence.");
      uploadedStorageKey = undefined;
    } finally {
      if (uploadedStorageKey) await storage.delete(uploadedStorageKey).catch(() => undefined);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await prepareStoryExportSmoke().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

interface StoryRow {
  readonly revision: number;
  readonly payload: unknown;
  readonly payload_hash: string;
}

async function resolveLegacyFrameRate(
  story: Story,
  storedPayload: unknown,
  storage: ObjectStorage,
  runner: SpawnMediaProcessRunner,
  temporaryDirectory: string,
): Promise<Story> {
  if (hasStoredOutputFrameRate(storedPayload)) return story;
  const firstVideo = story.scenes.flatMap(({ materials }) => materials).find((material): material is VideoMaterial => material.kind === "video");
  if (!firstVideo) return story;
  let frameRate = firstVideo.sourceFrameRate;
  if (!frameRate) {
    const source = firstVideo.videoTrack ?? firstVideo;
    const path = join(temporaryDirectory, `legacy-video${safeExtension(source.storageKey)}`);
    await pipeline(await storage.open(source.storageKey), createWriteStream(path, { flags: "wx" }));
    const probe = await probeMedia(path, runner) as { streams?: Array<Record<string, unknown>> };
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    frameRate = parseFrameRate(video?.avg_frame_rate) ?? parseFrameRate(video?.r_frame_rate);
  }
  return { ...story, outputFrameRate: frameRate ? normalizeFrameRate(frameRate) : defaultStoryFrameRate };
}

async function saveApprovedMix(
  database: Pool,
  story: Story,
  approvedMix: NonNullable<Story["approvedMix"]>,
  expectedRevision: number,
  expectedPayloadHash: string,
): Promise<boolean> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ revision: number; payload_hash: string }>(
      "SELECT revision, md5(payload::text) AS payload_hash FROM stories WHERE id = $1 AND profile_id = $2 FOR UPDATE",
      [story.id, story.profileId],
    );
    if (locked.rows[0]?.revision !== expectedRevision || locked.rows[0]?.payload_hash !== expectedPayloadHash) {
      await client.query("ROLLBACK");
      return false;
    }
    const updated = { ...story, approvedMix };
    await client.query("UPDATE stories SET payload = $2 WHERE id = $1", [story.id, updated]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function parseStoryId(arguments_: readonly string[]): string {
  const value = arguments_[0]?.trim();
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(usage);
  }
  return value;
}

export function requireLocalSmokeEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (environment.NODE_ENV === "production") throw new Error("the story export smoke command is disabled in production");
  if ((environment.MEDIA_STORAGE_DRIVER?.trim() || "local") !== "local") {
    throw new Error("the story export smoke command requires MEDIA_STORAGE_DRIVER=local");
  }
  const value = environment.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required");
  const hostname = new URL(value).hostname;
  if (hostname && !["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
    throw new Error("the story export smoke command refuses a non-local DATABASE_URL");
  }
  return value;
}

export function smokeMixFfmpegArguments(durationSeconds: number, mixPath: string): readonly string[] {
  return [
    "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-t", durationSeconds.toFixed(9), "-map", "0:a:0", "-c:a", "aac", "-profile:a", "aac_low",
    "-b:a", "192k", "-ar", "48000", "-ac", "2", "-map_metadata", "-1", "-movflags", "+faststart", mixPath,
  ];
}

function hasStoredOutputFrameRate(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, "outputFrameRate");
}

function safeExtension(storageKey: string): string {
  const extension = extname(storageKey).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/u.test(extension) ? extension : ".media";
}
