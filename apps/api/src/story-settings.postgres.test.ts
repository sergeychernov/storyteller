import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { StoryApplication } from "@storyteller/application";
import { addScene, createStory, defaultSoundtrackMix } from "@storyteller/domain";
import { PostgresStoryRepository } from "./database.js";
import { migrateDatabase } from "./migrations.js";
import { createPostgresTestPool, postgresTestOptions as options } from "./postgres-test-fixture.js";

test("PostgreSQL: soundtrack levels keep the revision and survive a concurrent timeline write", options, async (context) => {
  const { application, repository, story } = await createFixture(context);
  const mix = { ...defaultSoundtrackMix, video: 0.4, melody: 0.6 };
  const stored = await application.setStorySoundtrackMix(story.profileId, story.id, story.revision, mix);
  assert.deepEqual(stored.soundtrackMix, mix);
  assert.equal(stored.revision, story.revision);
  assert.deepEqual((await repository.findStory(story.profileId, story.id))?.soundtrackMix, mix);

  // `story` was read before the levels were saved, so its optimistic token still matches the unchanged revision.
  await repository.updateStory({ ...story, scenes: [], revision: story.revision + 1 });
  const merged = await repository.findStory(story.profileId, story.id);
  assert.deepEqual(merged?.soundtrackMix, mix, "the timeline write must carry the stored levels forward");
  assert.deepEqual(merged?.scenes, []);
  assert.equal(merged?.revision, story.revision + 1);

  const raised = { ...mix, rhythm: 0.5 };
  await application.setStorySoundtrackMix(story.profileId, story.id, merged!.revision, raised);
  assert.deepEqual((await repository.findStory(story.profileId, story.id))?.soundtrackMix, raised);
  await assert.rejects(
    application.setStorySoundtrackMix(story.profileId, story.id, merged!.revision + 5, raised),
    /story has changed/,
  );
});

async function createFixture(context: TestContext) {
  const { pool } = await createPostgresTestPool(context);
  await migrateDatabase(pool);
  const repository = new PostgresStoryRepository(pool, Buffer.alloc(32));
  const application = new StoryApplication(repository);
  const auth = await application.register({ name: "Test", email: "settings@example.com", password: "long-test-password" });
  const story = addScene(createStory({ id: randomUUID(), profileId: auth.profile.id }), randomUUID());
  await repository.createStory(story);
  return { pool, repository, application, story };
}
