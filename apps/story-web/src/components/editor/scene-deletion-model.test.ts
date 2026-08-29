import assert from "node:assert/strict";
import test from "node:test";
import type { Story } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { deleteSceneWithRecovery, newestStory, resolveSceneSelection, selectSceneAfterDeletion, storyEditorPath, type SceneDeletionTarget } from "./scene-deletion-model.js";

function story(ids: string[], revision = 4): Story {
  return {
    id: "story", profileId: "profile", status: "draft", revision,
    scenes: ids.map((id) => ({ id, materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" } })),
    narrations: [], music: { generationStatus: "idle", applied: false },
  };
}
const before = story(["a", "b", "c"]);
const target: SceneDeletionTarget = { sceneId: "b", name: "Scene 2", story: before };

test("deleting the selected first, middle, last or only scene selects a neighbor or the empty editor", () => {
  assert.equal(selectSceneAfterDeletion(before, story(["b", "c"]), "a", "a"), "b");
  assert.equal(selectSceneAfterDeletion(before, story(["a", "c"]), "b", "b"), "c");
  assert.equal(selectSceneAfterDeletion(before, story(["a", "b"]), "c", "c"), "b");
  assert.equal(selectSceneAfterDeletion(story(["a"]), story([]), "a", "a"), "");
  assert.equal(storyEditorPath("story", ""), "/story");
  assert.equal(storyEditorPath("story", "c"), "/story/scenes/c");
});

test("keeps a surviving current selection and skips neighbors removed by another client", () => {
  assert.equal(selectSceneAfterDeletion(before, story(["a", "c"]), "a", "b"), "a");
  assert.equal(selectSceneAfterDeletion(before, story(["a"]), "b", "b"), "a");
  assert.equal(selectSceneAfterDeletion(before, story(["new"]), "b", "b"), "new");
  const current = story(["a", "c"], 7);
  assert.equal(newestStory(current, before), current);
  assert.equal(newestStory(before, current), current);
  assert.equal(newestStory(undefined, current), current);
});

test("route normalization keeps the next or previous neighbor while the cache updates before the URL", () => {
  const after = story(["a", "c"], 5);
  assert.equal(resolveSceneSelection(after, before, "b"), "c");
  assert.equal(resolveSceneSelection(after, before, "c"), "c");
  assert.equal(resolveSceneSelection(story(["a", "b"], 5), before, "c"), "b");
  assert.equal(resolveSceneSelection(story([], 5), story(["a"]), "a"), "");
});

test("route selection handles initial loading and unrelated or unknown scene links", () => {
  const after = story(["a", "c"], 5);
  assert.equal(resolveSceneSelection(undefined, before, "b"), "");
  assert.equal(resolveSceneSelection(after, undefined, "c"), "c");
  assert.equal(resolveSceneSelection(after, undefined, "b"), "a");
  assert.equal(resolveSceneSelection(after, before, undefined), "a");
  assert.equal(resolveSceneSelection(after, { ...before, id: "another-story" }, "b"), "a");
});

test("passes the confirmed scene ID and revision without a second request on success", async () => {
  const after = story(["a", "c"], 5);
  const result = await deleteSceneWithRecovery(target, {
    remove: async (id, revision) => { assert.equal(id, "b"); assert.equal(revision, 4); return after; },
    read: async () => { assert.fail("successful deletion must not need a refetch"); },
  });
  assert.deepEqual(result, { status: "deleted", story: after });
});

test("recovers a committed deletion after a lost response or repeated DELETE", async () => {
  const after = story(["a", "c"], 5);
  for (const error of [new TypeError("network failed"), { status: 404, code: "scene_not_found" }]) {
    let calls = 0;
    assert.deepEqual(await deleteSceneWithRecovery(target, {
      remove: async () => { calls++; throw error; }, read: async () => after,
    }), { status: "deleted", story: after });
    assert.equal(calls, 1);
  }
});

test("requires a fresh confirmation after a revision change and blocks noneditable stories", async () => {
  const changed = story(["a", "b", "c"], 5);
  const remove = async (): Promise<Story> => { throw { status: 409 }; };
  assert.deepEqual(await deleteSceneWithRecovery(target, { remove, read: async () => changed }), { status: "changed", story: changed });
  const publishing: Story = { ...before, status: "publishing" };
  assert.deepEqual(await deleteSceneWithRecovery(target, { remove, read: async () => publishing }), { status: "blocked", story: publishing });
});

test("a failed request with the unchanged scene allows an explicit retry", async () => {
  assert.deepEqual(await deleteSceneWithRecovery(target, {
    remove: async () => { throw new Error("service unavailable"); }, read: async () => before,
  }), { status: "failed", story: before });
});

test("an ambiguous failure never repeats DELETE while checking the outcome", async () => {
  let deletes = 0;
  const remove = async (): Promise<Story> => { deletes++; throw new TypeError("offline"); };
  const read = async (): Promise<Story> => { throw new TypeError("offline"); };
  assert.deepEqual(await deleteSceneWithRecovery(target, { remove, read }), { status: "unverified" });
  assert.deepEqual(await deleteSceneWithRecovery(target, { remove, read }, true), { status: "unverified" });
  assert.equal(deletes, 1);
  assert.deepEqual(await deleteSceneWithRecovery(target, { remove, read: async () => before }, true), { status: "failed", story: before });
  assert.equal(deletes, 1);
  const after = story(["a", "c"], 5);
  assert.deepEqual(await deleteSceneWithRecovery(target, { remove, read: async () => after }, true), { status: "deleted", story: after });
  assert.equal(deletes, 1);
});

test("scene deletion confirmation and recovery messages are available in all Web locales", () => {
  for (const locale of ["en", "ru", "sr-Latn", "es"] as const) {
    const copy = getEditorCopy(locale);
    assert.ok(copy.deleteScene);
    assert.ok(copy.deleteSceneTitle.includes("{{name}}"));
    assert.ok(copy.deleteSceneConfirmation);
    assert.ok(copy.confirmDeleteScene && copy.deletingScene && copy.checkSceneDeletion);
    assert.ok(copy.sceneDeleteChanged && copy.sceneDeleteBlocked && copy.sceneDeleteUnverified && copy.sceneDeleteError);
  }
});
