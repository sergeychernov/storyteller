import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { setTimeout } from "node:timers/promises";
import { StoryApplication } from "@storyteller/application";
import { addMaterial, addScene, configureScene, createStory, removeScene } from "@storyteller/domain";
import { PostgresSceneRenderQueue, type SceneRenderInput } from "@storyteller/render-queue";
import { Pool } from "pg";
import { PostgresStoryRepository } from "./database.js";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";

test("PostgreSQL: scene deletion commits the story, render removal and cleanup together", options, async (context) => {
  const fixture = await createFixture(context);
  const { application, repository, pool, story, sceneId, otherSceneId } = fixture;
  const ready = await enqueueRender(fixture);
  const running = await enqueueRender(fixture);
  const queued = await enqueueRender(fixture);
  const retained = await enqueueRender(fixture, otherSceneId);
  await pool.query("UPDATE scene_renders SET status = 'ready', storage_key = 'ready.mp4' WHERE id = $1", [ready.id]);
  await pool.query("UPDATE scene_renders SET status = 'running', worker_id = 'worker' WHERE id = $1", [running.id]);
  await pool.query("INSERT INTO object_deletion_jobs (storage_key, status, attempts) VALUES ('ready.mp4', 'failed', 10)");

  const changed = await application.deleteScene(story.profileId, story.id, sceneId, story.revision);
  assert.deepEqual(await repository.findStory(story.profileId, story.id), changed);
  assert.deepEqual(changed.scenes.map(({ id }) => id), [otherSceneId]);
  assert.equal(changed.revision, story.revision + 1);
  assert.deepEqual((await pool.query("SELECT id FROM scene_renders")).rows, [{ id: retained.id }]);
  assert.deepEqual((await pool.query("SELECT storage_key, status, attempts FROM object_deletion_jobs ORDER BY storage_key")).rows, [
    { storage_key: "original.png", status: "queued", attempts: 0 },
    { storage_key: "ready.mp4", status: "queued", attempts: 0 },
  ]);
  assert.equal(await fixture.queue.complete(running.id, "worker", "late.mp4", 100, "a".repeat(64)), false);
  assert.equal(await fixture.queue.findAuthorized(story.profileId, story.id, sceneId, queued.id), undefined);
});

test("PostgreSQL: stale deletes and stale saves cannot overwrite a newer story", options, async (context) => {
  const { application, repository, pool, story, sceneId, otherSceneId } = await createFixture(context);
  const edited = configureScene(story, otherSceneId, { durationSeconds: 7 });
  await repository.updateStory(edited);
  await assert.rejects(repository.deleteScene(removeScene(story, sceneId), sceneId, ["original.png"]), {
    statusCode: 409, code: "story_revision_conflict",
  });
  assert.deepEqual(await repository.findStory(story.profileId, story.id), edited);
  assert.equal((await pool.query("SELECT * FROM object_deletion_jobs")).rowCount, 0);

  const changed = await application.deleteScene(story.profileId, story.id, sceneId);
  await assert.rejects(repository.updateStory(configureScene(edited, otherSceneId, { durationSeconds: 9 })), {
    statusCode: 409, code: "story_revision_conflict",
  });
  assert.deepEqual(await repository.findStory(story.profileId, story.id), changed);
  await assert.rejects(repository.updateStory({ ...changed, profileId: randomUUID(), revision: changed.revision + 1 }), { statusCode: 404 });
});

test("PostgreSQL: cleanup failure rolls back scene deletion and render removal", options, async (context) => {
  const fixture = await createFixture(context);
  const { application, repository, pool, story, sceneId } = fixture;
  const render = await enqueueRender(fixture);
  await pool.query("UPDATE scene_renders SET status = 'ready', storage_key = 'render.mp4' WHERE id = $1", [render.id]);
  await pool.query("ALTER TABLE object_deletion_jobs ADD CONSTRAINT reject_test_cleanup CHECK (storage_key <> 'original.png')");
  await assert.rejects(application.deleteScene(story.profileId, story.id, sceneId), { code: "23514" });
  assert.deepEqual(await repository.findStory(story.profileId, story.id), story);
  assert.equal((await pool.query("SELECT * FROM object_deletion_jobs")).rowCount, 0);
  assert.equal((await pool.query("SELECT * FROM scene_renders WHERE id = $1", [render.id])).rowCount, 1);
});

test("PostgreSQL: simultaneous scene deletes increment the revision only once", options, async (context) => {
  const { application, pool, story, sceneId } = await createFixture(context);
  const results = await Promise.allSettled([
    application.deleteScene(story.profileId, story.id, sceneId),
    application.deleteScene(story.profileId, story.id, sceneId),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && [404, 409].includes(rejected.reason.statusCode));
  assert.equal((await application.getStory(story.profileId, story.id)).revision, story.revision + 1);
  assert.equal((await pool.query("SELECT * FROM object_deletion_jobs")).rowCount, 1);
});

test("PostgreSQL: render enqueue rejects missing and unauthorized scenes", options, async (context) => {
  const { application, queue, pool, story, sceneId } = await createFixture(context);
  const job = renderJob(story.profileId, story.id, sceneId);
  assert.equal(await queue.enqueue({ ...job, profileId: randomUUID() }), undefined);
  await application.deleteScene(story.profileId, story.id, sceneId);
  assert.equal(await queue.enqueue(job), undefined);
  assert.equal((await pool.query("SELECT * FROM scene_renders")).rowCount, 0);
});

test("PostgreSQL: enqueue waits for a deleting transaction and rechecks scene existence", options, async (context) => {
  const { queue, pool, story, sceneId } = await createFixture(context);
  const deleting = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await deleting.query("BEGIN");
    const pid = (await deleting.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const changed = removeScene(story, sceneId);
    await deleting.query("UPDATE stories SET payload = $2, revision = $3 WHERE id = $1", [story.id, changed, changed.revision]);
    pending = queue.enqueue(renderJob(story.profileId, story.id, sceneId));
    await waitForBlockedQuery(pool, pid);
    await deleting.query("COMMIT");
    assert.equal(await pending, undefined);
    assert.equal((await pool.query("SELECT * FROM scene_renders")).rowCount, 0);
  } finally {
    await deleting.query("ROLLBACK");
    deleting.release();
    await pending?.catch(() => undefined);
  }
});

test("PostgreSQL: deletion waits for an enqueuing transaction and removes its job", options, async (context) => {
  const { application, pool, story, sceneId } = await createFixture(context);
  const enqueuing = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await enqueuing.query("BEGIN");
    const pid = (await enqueuing.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const queue = new PostgresSceneRenderQueue(enqueuing);
    assert.ok(await queue.enqueue(renderJob(story.profileId, story.id, sceneId)));
    pending = application.deleteScene(story.profileId, story.id, sceneId);
    await waitForBlockedQuery(pool, pid);
    await enqueuing.query("COMMIT");
    await pending;
    assert.equal((await pool.query("SELECT * FROM scene_renders")).rowCount, 0);
  } finally {
    await enqueuing.query("ROLLBACK");
    enqueuing.release();
    await pending?.catch(() => undefined);
  }
});

test("PostgreSQL: deletion captures an artifact completed by a concurrent worker", options, async (context) => {
  const fixture = await createFixture(context);
  const { application, pool, story, sceneId } = fixture;
  const render = await enqueueRender(fixture);
  const worker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await worker.query("BEGIN");
    const pid = (await worker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await worker.query("UPDATE scene_renders SET status = 'ready', storage_key = 'just-finished.mp4' WHERE id = $1", [render.id]);
    pending = application.deleteScene(story.profileId, story.id, sceneId);
    await waitForBlockedQuery(pool, pid);
    await worker.query("COMMIT");
    await pending;
    assert.deepEqual((await pool.query("SELECT storage_key FROM object_deletion_jobs ORDER BY storage_key")).rows, [
      { storage_key: "just-finished.mp4" }, { storage_key: "original.png" },
    ]);
    assert.equal((await pool.query("SELECT * FROM scene_renders")).rowCount, 0);
  } finally {
    await worker.query("ROLLBACK");
    worker.release();
    await pending?.catch(() => undefined);
  }
});

test("PostgreSQL: versions persist content hashes and reject stale snapshots and late completions", options, async (context) => {
  const { pool, queue, repository, story, sceneId } = await createFixture(context);
  const job = renderJob(story.profileId, story.id, sceneId);
  const queued = await queue.enqueue(job, story.revision);
  assert.ok(queued);
  const running = await queue.claim("worker", 60_000);
  assert.equal(running?.id, queued.id);
  const contentHash = "a".repeat(64);
  assert.equal(await queue.complete(queued.id, "other-worker", "wrong.mp4", 10, contentHash), false);
  assert.equal(await queue.complete(queued.id, "worker", "result.mp4", 10, contentHash), true);
  assert.equal(await queue.complete(queued.id, "worker", "late.mp4", 20, "b".repeat(64)), false);
  const reopened = new PostgresSceneRenderQueue(pool);
  const history = await reopened.listAuthorized(story.profileId, story.id, sceneId);
  assert.equal(history[0]?.contentHash, contentHash);
  assert.equal(history[0]?.storageKey, "result.mp4");
  assert.ok(history[0]?.createdAt);
  assert.deepEqual(await reopened.listAuthorized(randomUUID(), story.id, sceneId), []);
  assert.equal((await reopened.enqueue(job, story.revision))?.id, queued.id);
  await repository.updateStory(configureScene(story, sceneId, { durationSeconds: 8 }));
  assert.equal(await reopened.enqueue(renderJob(story.profileId, story.id, sceneId), story.revision), undefined);
  assert.equal((await pool.query("SELECT count(*)::integer AS count FROM scene_renders")).rows[0].count, 1);
});

test("PostgreSQL: retry refreshes source locations without changing the content version", options, async (context) => {
  const { queue, pool, story, sceneId } = await createFixture(context);
  const job = renderJob(story.profileId, story.id, sceneId);
  await queue.enqueue(job);
  await pool.query("UPDATE scene_renders SET status = 'failed', attempts = 3, error = 'old path' WHERE id = $1", [job.id]);
  const retry = await queue.enqueue({ ...job, id: randomUUID(), input: { ...job.input, material: { ...job.input.material, storageKey: "new-path.png" } } });
  assert.equal(retry?.id, job.id);
  assert.equal(retry?.status, "queued");
  assert.equal(retry?.input.material.storageKey, "new-path.png");
  assert.equal(retry?.error, undefined);
  assert.equal((await queue.claim("retry-worker", 60_000))?.id, job.id);
});

async function createFixture(context: TestContext) {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const repository = new PostgresStoryRepository(pool, Buffer.alloc(32));
  const application = new StoryApplication(repository);
  const auth = await application.register({ name: "Test", email: "delete@example.com", password: "long-test-password" });
  const sceneId = randomUUID(), otherSceneId = randomUUID();
  const story = addMaterial(addScene(addScene(createStory({ id: randomUUID(), profileId: auth.profile.id }), sceneId), otherSceneId), sceneId, {
    id: randomUUID(), kind: "image", name: "original.png", storageKey: "original.png", mimeType: "image/png",
    orientation: "landscape", width: 100, height: 100, sizeBytes: 200,
  });
  await repository.createStory(story);
  return { pool, repository, application, queue: new PostgresSceneRenderQueue(pool), story, sceneId, otherSceneId };
}

function renderJob(profileId: string, storyId: string, sceneId: string) {
  const id = randomUUID();
  const input: SceneRenderInput = {
    rendererId: "still-image", rendererVersion: 1,
    material: { storageKey: "original.png", name: "original.png", mimeType: "image/png", width: 100, height: 100, orientation: "landscape" },
    durationSeconds: 5, motion: "none", focusPoint: { x: 0.5, y: 0.5 },
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
  };
  return { id, profileId, storyId, sceneId, input, inputHash: id.replaceAll("-", "").repeat(2) };
}

async function enqueueRender(fixture: Awaited<ReturnType<typeof createFixture>>, sceneId = fixture.sceneId) {
  const job = await fixture.queue.enqueue(renderJob(fixture.story.profileId, fixture.story.id, sceneId));
  assert.ok(job);
  return job;
}

async function waitForBlockedQuery(pool: Pool, blockerPid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await pool.query<{ waiting: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))) AS waiting", [blockerPid],
    );
    if (result.rows[0]!.waiting) return;
    await setTimeout(20);
  }
  assert.fail("expected a concurrent query to wait for the transaction lock");
}
