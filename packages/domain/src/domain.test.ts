import assert from "node:assert/strict";
import test from "node:test";
import { addMaterial, addNarration, addScene, createStory, selectRenderer, setSceneTitle, transitionStory } from "./index.js";

test("a render starts only when every scene has material and a renderer", () => {
  const draft = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  assert.throws(() => transitionStory(draft, "rendering"), /material and a renderer/);
  const withMaterial = addMaterial(draft, "scene-1", { id: "photo", kind: "image" });
  const readyToRender = selectRenderer(withMaterial, "scene-1", "still-image");
  assert.equal(transitionStory(readyToRender, "rendering").status, "rendering");
});

test("editing a ready story creates a new draft revision", () => {
  const draft = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  const ready = { ...draft, status: "ready" as const };
  const edited = setSceneTitle(ready, "scene-1", "Opening");
  assert.equal(edited.status, "draft");
  assert.equal(edited.revision, ready.revision + 1);
});

test("narration starts at an existing scene", () => {
  const draft = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  const result = addNarration(draft, { id: "voice-1", assetId: "audio-1", fromSceneId: "scene-1" });
  assert.equal(result.narrations[0]?.fromSceneId, "scene-1");
  assert.throws(() => addNarration(draft, { id: "voice-2", assetId: "audio-2", fromSceneId: "missing" }), /unknown scene/);
});
