import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresSoundtrackRenderQueue, PostgresStoryExportQueue, type StoryExportManifest, type SoundtrackProvenance, type SoundtrackRenderInput,
} from "@storyteller/render-queue";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";

test("PostgreSQL: soundtrack jobs are idempotent, leased, retried, authorized, and retain provenance", options,
  async (context) => {
    const { pool } = await createPostgresTestPool(context);
    await migrateDatabase(pool);
    const profileId = randomUUID(), otherProfileId = randomUUID(), storyId = randomUUID();
    await pool.query(
      `INSERT INTO profiles (id, name, email, password_hash) VALUES
       ($1, 'Composer', $2, 'hash'), ($3, 'Other', $4, 'hash')`,
      [profileId, `${profileId}@example.test`, otherProfileId, `${otherProfileId}@example.test`],
    );
    await pool.query(
      `INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload)
       VALUES ($1, $2, 'Music', 'draft', 1, 7, $3)`,
      [storyId, profileId, { id: storyId, profileId, revision: 7, scenes: [{ id: randomUUID() }] }],
    );
    const queue = new PostgresSoundtrackRenderQueue(pool);
    const firstId = randomUUID();
    const first = await queue.enqueue({
      id: firstId, profileId, storyId, inputHash: "a".repeat(64), input: soundtrackInput(7, 150, 240_000),
    }, 7);
    const repeated = await queue.enqueue({
      id: randomUUID(), profileId, storyId, inputHash: "a".repeat(64), input: soundtrackInput(7, 150, 240_000),
    }, 7);
    assert.equal(first?.id, firstId);
    assert.equal(repeated?.id, firstId);
    assert.equal(await queue.findAuthorized(otherProfileId, storyId, firstId), undefined);

    assert.equal((await queue.claim("worker-1", 10_000))?.id, firstId);
    await pool.query("UPDATE soundtrack_renders SET locked_until = now() - interval '1 second' WHERE id = $1", [firstId]);
    assert.equal((await queue.claim("worker-2", 10_000))?.id, firstId);
    assert.equal((await queue.complete(firstId, "worker-1", artifacts, provenance(first!.input))).accepted, false);
    await queue.fail(firstId, "worker-2", "transient failure");
    assert.equal((await queue.claim("worker-3", 10_000))?.id, firstId);
    await queue.fail(firstId, "worker-3", "persistent failure");
    assert.equal((await queue.findAuthorized(profileId, storyId, firstId))?.status, "failed");

    const retried = await queue.enqueue({
      id: randomUUID(), profileId, storyId, inputHash: "a".repeat(64), input: soundtrackInput(7, 150, 240_000),
    }, 7);
    assert.equal(retried?.id, firstId);
    assert.equal(retried?.status, "queued");
    assert.equal((await queue.claim("worker-4", 10_000))?.id, firstId);
    assert.equal((await queue.complete(firstId, "worker-4", artifacts, provenance(first!.input))).accepted, true);
    const ready = await queue.findAuthorized(profileId, storyId, firstId);
    assert.equal(ready?.status, "ready");
    assert.equal(ready?.preview?.contentHash, "b".repeat(64));
    assert.equal(ready?.provenance?.externalAudioAssets, false);
    assert.equal(ready?.rhythmPreview?.contentHash, "e".repeat(64));
    assert.equal(ready?.melodyPreview?.contentHash, "f".repeat(64));

    await pool.query("UPDATE stories SET revision = 8, payload = jsonb_set(payload, '{revision}', '8') WHERE id = $1", [storyId]);
    assert.equal(await queue.enqueue({
      id: randomUUID(), profileId, storyId, inputHash: "c".repeat(64), input: soundtrackInput(8, 180, 288_000),
    }, 7), undefined);
    const changedId = randomUUID();
    const changed = await queue.enqueue({
      id: changedId, profileId, storyId, inputHash: "c".repeat(64), input: soundtrackInput(8, 180, 288_000),
    }, 8);
    assert.equal(changed?.id, changedId);
    assert.equal((await queue.findCurrentAuthorized(profileId, storyId))?.id, changedId);
    assert.deepEqual((await pool.query("SELECT code FROM product_activity_events ORDER BY id")).rows.map(({ code }) => code), [
      "story.soundtrack_requested", "story.soundtrack_ready", "story.soundtrack_requested",
    ]);

    const newerId = randomUUID();
    await queue.enqueue({ id: newerId, profileId, storyId, inputHash: "d".repeat(64), input: soundtrackInput(8, 180, 288_000) }, 8);
    assert.equal((await queue.claim("worker-5", 10_000))?.id, changedId);
    // Completing prunes only the variants created before this one, so a newer request is never discarded.
    const superseding = await queue.complete(changedId, "worker-5", artifacts, provenance(changed!.input));
    assert.equal(superseding.accepted, true);
    assert.deepEqual([...superseding.supersededStorageKeys].sort(),
      ["melody.flac", "melody.m4a", "rhythm.flac", "rhythm.m4a", "soundtrack.m4a"]);
    assert.deepEqual((await pool.query("SELECT id FROM soundtrack_renders ORDER BY id")).rows.map(({ id }) => id),
      [changedId, newerId].sort());
  });

const artifacts = {
  preview: { storageKey: "soundtrack.m4a", contentHash: "b".repeat(64), sizeBytes: 100, mimeType: "audio/mp4" as const },
  rhythmStem: { storageKey: "rhythm.flac", contentHash: "c".repeat(64), sizeBytes: 200, mimeType: "audio/flac" as const },
  melodyStem: { storageKey: "melody.flac", contentHash: "d".repeat(64), sizeBytes: 200, mimeType: "audio/flac" as const },
  rhythmPreview: { storageKey: "rhythm.m4a", contentHash: "e".repeat(64), sizeBytes: 150, mimeType: "audio/mp4" as const },
  melodyPreview: { storageKey: "melody.m4a", contentHash: "f".repeat(64), sizeBytes: 150, mimeType: "audio/mp4" as const },
};

function soundtrackInput(storyRevision: number, totalFrames: number, totalSampleFrames: number): SoundtrackRenderInput {
  return {
    version: 1, storyRevision, frameRate: { numerator: 30, denominator: 1 }, totalFrames, totalSampleFrames,
    presetId: "road", presetVersion: 1, engineId: "storyteller-procedural", engineVersion: 5, seed: "seed", melodyVariant: 0,
  };
}

function provenance(input: SoundtrackRenderInput): SoundtrackProvenance {
  return {
    origin: "storyteller_procedural", engineId: "storyteller-procedural", engineVersion: 5,
    presetId: "road", presetVersion: 1, seed: input.seed, melodyVariant: 0, sampleRate: 48_000, channels: 2,
    sampleFrames: input.totalSampleFrames, durationFrames: input.totalFrames, frameRate: input.frameRate,
    previewPcmSha256: "a".repeat(64), previewSha256: "b".repeat(64),
    rhythmStemSha256: "c".repeat(64), melodyStemSha256: "d".repeat(64),
    rhythmPreviewSha256: "e".repeat(64), melodyPreviewSha256: "f".repeat(64), externalAudioAssets: false,
    licenseVersion: "storyteller-generated-music-1.0", generatedAt: "2026-09-04T00:00:00.000Z",
  };
}


for (const status of ["queued", "assembling"] as const) {
  test(`PostgreSQL: supersession retains stems referenced by an ${status} export, including an in-flight enqueue`, options, async (context) => {
    const { pool } = await createPostgresTestPool(context);
    await migrateDatabase(pool);
    const profileId = randomUUID(), storyId = randomUUID(), firstId = randomUUID(), nextId = randomUUID();
    await pool.query("INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, 'Music', $2, 'hash')", [profileId, `${profileId}@example.test`]);
    await pool.query(`INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload)
      VALUES ($1, $2, 'Music', 'draft', 0, 7, $3)`, [storyId, profileId, { id: storyId, profileId, revision: 7, scenes: [] }]);
    const queue = new PostgresSoundtrackRenderQueue(pool);
    const input = soundtrackInput(7, 150, 240_000);
    await queue.enqueue({ id: firstId, profileId, storyId, inputHash: "a".repeat(64), input }, 7);
    await queue.claim("first", 10_000);
    await queue.complete(firstId, "first", artifacts, provenance(input));
    await queue.enqueue({ id: nextId, profileId, storyId, inputHash: "b".repeat(64), input }, 7);
    await queue.claim("next", 10_000);
    const manifest: StoryExportManifest = {
      version: 3, storyRevision: 7, timelineHash: "a".repeat(64), outputProfileId: "vertical-social-v1",
      frameRate: input.frameRate, totalFrames: 150, segments: [], audioSegments: [],
      levels: { video: 1, rhythm: 1, melody: 1, duckedMelody: 0.3 },
      soundtrack: { renderId: firstId,
        rhythm: { storageKey: artifacts.rhythmStem.storageKey, contentHash: artifacts.rhythmStem.contentHash },
        melody: { storageKey: artifacts.melodyStem.storageKey, contentHash: artifacts.melodyStem.contentHash } },
    };
    // Reproduce the enqueue's FOR SHARE protocol while its parent INSERT is still uncommitted.
    const enqueue = await pool.connect();
    await enqueue.query("BEGIN");
    await enqueue.query("SELECT id FROM soundtrack_renders WHERE id = $1 FOR SHARE", [firstId]);
    const exportId = randomUUID();
    await enqueue.query(`INSERT INTO story_exports
      (id, profile_id, story_id, manifest_hash, manifest, story_revision, timeline_hash, output_profile_id, status)
      VALUES ($1, $2, $3, $4, $5, 7, $4, 'vertical-social-v1', $6)`,
    [exportId, profileId, storyId, "a".repeat(64), manifest, status]);
    const newer = Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, { ...artifact, storageKey: `next/${artifact.storageKey}` }])) as typeof artifacts;
    const completion = queue.complete(nextId, "next", newer, provenance(input));
    // Wait for actual lock contention, so the test proves the DELETE uses a post-lock snapshot.
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT superseded.id%'`)).rowCount);
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(waiting, "supersession must wait for the enqueue's stem lock");
    } finally { await enqueue.query("COMMIT"); enqueue.release(); }
    const result = await completion;
    assert.equal(result.accepted, true);
    assert.deepEqual(result.supersededStorageKeys, []);
    assert.equal((await queue.findAuthorized(profileId, storyId, firstId))?.status, "ready");
    const exports = new PostgresStoryExportQueue(pool);
    assert.ok(await exports.enqueue({ id: randomUUID(), profileId, storyId, manifestHash: "c".repeat(64), manifest }));
    // Once every referencing export is terminal a later supersession may collect the old stems.
    await pool.query("UPDATE story_exports SET status = 'canceled' WHERE story_id = $1", [storyId]);
    const finalId = randomUUID();
    await queue.enqueue({ id: finalId, profileId, storyId, inputHash: "d".repeat(64), input }, 7);
    await queue.claim("final", 10_000);
    const final = await queue.complete(finalId, "final", newer, provenance(input));
    assert.ok(final.supersededStorageKeys.includes(artifacts.rhythmStem.storageKey));
    assert.equal(await exports.enqueue({ id: randomUUID(), profileId, storyId, manifestHash: "e".repeat(64), manifest }), undefined,
      "an enqueue that loses the race must not retain deleted object keys");
  });
}
