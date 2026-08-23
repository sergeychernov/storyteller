import assert from "node:assert/strict";
import test from "node:test";
import {
  addMaterial, addNarration, addScene, configureScene, createStory, getLayoutOptions, reorderMaterials,
  selectRenderer, setSceneTitle, transitionStory,
} from "./index.js";

test("a render starts only when every scene has material and a renderer", () => {
  const draft = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  assert.throws(() => transitionStory(draft, "rendering"), /material and a renderer/);
  const withMaterial = addMaterial(draft, "scene-1", imageMaterial("photo", "portrait"));
  const readyToRender = selectRenderer(withMaterial, "scene-1", "still-image");
  assert.equal(transitionStory(readyToRender, "rendering").status, "rendering");
});

test("material order determines layout choices and changing order invalidates the selection", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("p1", "portrait"));
  story = addMaterial(story, "scene-1", imageMaterial("p2", "portrait"));
  story = addMaterial(story, "scene-1", {
    ...fileMetadata("l1", "landscape"), kind: "video", hasAudio: true, audioTags: ["voice", "ambient"],
  });
  assert.deepEqual(getLayoutOptions(story.scenes[0]!.materials).map(({ id }) => id), ["2+1", "overlap-stack"]);
  story = configureScene(story, "scene-1", { layoutId: "2+1" });
  story = reorderMaterials(story, "scene-1", ["l1", "p1", "p2"]);
  assert.equal(story.scenes[0]!.layoutId, undefined);
});

test("six portrait materials expose four explicit cascade choices", () => {
  const materials = Array.from({ length: 6 }, (_, index) => imageMaterial(`p${index}`, "portrait"));
  assert.equal(getLayoutOptions(materials).length, 4);
});

function imageMaterial(id: string, orientation: "portrait" | "landscape") {
  return { ...fileMetadata(id, orientation), kind: "image" as const };
}

function fileMetadata(id: string, orientation: "portrait" | "landscape") {
  return {
    id, name: `${id}.jpg`, orientation, storageKey: `${id}.jpg`, mimeType: "image/jpeg", sizeBytes: 100,
    width: orientation === "portrait" ? 100 : 200, height: orientation === "portrait" ? 200 : 100,
  };
}

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
