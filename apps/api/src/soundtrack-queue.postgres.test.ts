import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresSoundtrackRenderQueue, type SoundtrackProvenance, type SoundtrackRenderInput,
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
