import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultSceneTitle, type Story } from "@storyteller/domain";
import type { OpenAPIV3 } from "openapi-types";
import { accessPolicyForRoute } from "./access-control.js";
import { renderFixture } from "./app-test-support.js";

test("scene title API saves, reopens, revision-checks and removes an optional title", async (context) => {
  const fixture = await renderFixture(context);
  const before = await fixture.application.getStory(fixture.profileId, fixture.storyId);
  const title = { ...createDefaultSceneTitle("  Первый снег  ", 5), position: { x: 0.24, y: 0.81 } };
  const url = `/stories/${fixture.storyId}/scenes/${fixture.sceneId}/title`;

  const unauthorized = await fixture.api.inject({ method: "PUT", url, payload: { title, expectedRevision: before.revision } });
  assert.equal(unauthorized.statusCode, 401);
  const savedResponse = await fixture.api.inject({
    method: "PUT", url, headers: fixture.headers, payload: { title, expectedRevision: before.revision },
  });
  assert.equal(savedResponse.statusCode, 200, savedResponse.body);
  const saved = savedResponse.json<Story>();
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.scenes.find(({ id }) => id === fixture.sceneId)?.title?.text, "Первый снег");
  assert.deepEqual(saved.scenes.find(({ id }) => id === fixture.sceneId)?.title?.position, { x: 0.24, y: 0.81 });
  assert.deepEqual(saved.scenes.find(({ id }) => id === fixture.sceneId)?.render, { status: "idle" });

  const reopened = (await fixture.api.inject({ method: "GET", url: `/stories/${fixture.storyId}`, headers: fixture.headers })).json<Story>();
  assert.deepEqual(reopened.scenes.find(({ id }) => id === fixture.sceneId)?.title, saved.scenes.find(({ id }) => id === fixture.sceneId)?.title);
  const conflict = await fixture.api.inject({
    method: "PUT", url, headers: fixture.headers, payload: { title, expectedRevision: before.revision },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json<{ code: string }>().code, "story_revision_conflict");

  const removedResponse = await fixture.api.inject({
    method: "PUT", url, headers: fixture.headers, payload: { title: null, expectedRevision: saved.revision },
  });
  assert.equal(removedResponse.statusCode, 200, removedResponse.body);
  assert.equal(removedResponse.json<Story>().scenes.find(({ id }) => id === fixture.sceneId)?.title, undefined);
});

test("scene title API rejects unknown fields, invalid values, missing scenes and empty scenes", async (context) => {
  const fixture = await renderFixture(context);
  const story = await fixture.application.getStory(fixture.profileId, fixture.storyId);
  const title = createDefaultSceneTitle("Title", 5);
  const url = `/stories/${fixture.storyId}/scenes/${fixture.sceneId}/title`;
  const strict = await fixture.api.inject({
    method: "PUT", url, headers: fixture.headers, payload: { title, expectedRevision: story.revision, unexpected: true },
  });
  assert.equal(strict.statusCode, 400);
  const invalid = await fixture.api.inject({
    method: "PUT", url, headers: fixture.headers,
    payload: { title: { ...title, timing: { startSeconds: 4.8, endSeconds: 5 } }, expectedRevision: story.revision },
  });
  assert.equal(invalid.statusCode, 422, invalid.body);
  assert.equal(invalid.json<{ code: string }>().code, "invalid_scene_title");
  const missing = await fixture.api.inject({
    method: "PUT", url: `/stories/${fixture.storyId}/scenes/00000000-0000-4000-8000-000000000099/title`, headers: fixture.headers,
    payload: { title, expectedRevision: story.revision },
  });
  assert.equal(missing.statusCode, 404);

  const withEmpty = await fixture.application.createScene(fixture.profileId, fixture.storyId);
  const empty = withEmpty.scenes.at(-1)!;
  const emptyResponse = await fixture.api.inject({
    method: "PUT", url: `/stories/${fixture.storyId}/scenes/${empty.id}/title`, headers: fixture.headers,
    payload: { title, expectedRevision: withEmpty.revision },
  });
  assert.equal(emptyResponse.statusCode, 422);
});

test("scene title route is documented and protected by story update access", async (context) => {
  const fixture = await renderFixture(context);
  assert.equal(accessPolicyForRoute("PUT", "/stories/:storyId/scenes/:sceneId/title"), "story.update");
  const operation = (fixture.api.swagger() as OpenAPIV3.Document)
    .paths["/stories/{storyId}/scenes/{sceneId}/title"]?.put;
  assert.ok(operation);
  assert.ok(operation.responses?.["409"]);
  assert.ok(operation.responses?.["422"]);
});
