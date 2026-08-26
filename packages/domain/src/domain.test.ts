import assert from "node:assert/strict";
import test from "node:test";
import {
  addMaterial, addNarration, addScene, configureScene, createStory, getLayoutOptions, mergeMaterialOrder, reorderMaterials,
  focusDwellProgress, removeMaterial, selectRenderer, setSceneTitle, transitionStory,
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

test("one image gets orientation-aware motion, centered focus and the still-image renderer", () => {
  const empty = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  const landscape = addMaterial(empty, "scene-1", imageMaterial("photo", "landscape"));
  assert.equal(landscape.scenes[0]?.layoutId, "full-frame");
  assert.equal(landscape.scenes[0]?.motion, "pan-right");
  assert.deepEqual(landscape.scenes[0]?.focusPoint, { x: 0.5, y: 0.5 });
  assert.equal(landscape.scenes[0]?.rendererId, "still-image");
  const focused = configureScene(landscape, "scene-1", { focusPoint: { x: 0.25, y: 0.75 } });
  assert.deepEqual(focused.scenes[0]?.focusPoint, { x: 0.25, y: 0.75 });
  assert.throws(() => configureScene(landscape, "scene-1", { motion: "zoom-in" }), /not available/);

  const portrait = addMaterial(empty, "scene-1", imageMaterial("portrait", "portrait"));
  assert.equal(portrait.scenes[0]?.motion, "zoom-in");
});

test("focus belongs only to the single-image renderer", () => {
  const empty = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  assert.throws(() => configureScene(empty, "scene-1", { focusPoint: { x: 0.2, y: 0.7 } }), /single-image renderer/);
  const oneImage = addMaterial(empty, "scene-1", imageMaterial("first", "portrait"));
  const layout = addMaterial(oneImage, "scene-1", imageMaterial("second", "portrait"));
  assert.equal(layout.scenes[0]?.rendererId, undefined);
  assert.equal(layout.scenes[0]?.focusPoint, undefined);
  assert.throws(() => configureScene(layout, "scene-1", { focusPoint: { x: 0.2, y: 0.7 } }), /single-image renderer/);
});

test("focus dwell keeps full pan travel and slows at the focus", () => {
  const focus = 0.35;
  assert.equal(focusDwellProgress(0, focus), 0);
  assert.equal(focusDwellProgress(1, focus), 1);
  assert.ok(Math.abs(focusDwellProgress(focus, focus) - focus) < 1e-9);
  const localTravel = focusDwellProgress(focus + 0.001, focus) - focusDwellProgress(focus - 0.001, focus);
  assert.ok(localTravel < 0.0015);
  for (const checkedFocus of [0, 0.1, 0.35, 0.5, 0.9, 1]) {
    const values = Array.from({ length: 101 }, (_, index) => focusDwellProgress(index / 100, checkedFocus));
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 1);
    assert.ok(values.every((value, index) => index === 0 || value >= values[index - 1]!));
  }
});

test("removing a material invalidates the layout and rejects an unknown material", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("p1", "portrait"));
  story = addMaterial(story, "scene-1", imageMaterial("p2", "portrait"));
  story = configureScene(story, "scene-1", { layoutId: "overlap-stack" });
  const changed = removeMaterial(story, "scene-1", "p1");
  assert.deepEqual(changed.scenes[0]!.materials.map(({ id }) => id), ["p2"]);
  assert.equal(changed.scenes[0]!.layoutId, "full-frame");
  assert.throws(() => removeMaterial(changed, "scene-1", "missing"), /unknown material/);
});

test("new materials merge into an in-progress local order", () => {
  const first = { id: "first", version: 1 };
  const second = { id: "second", version: 1 };
  const uploaded = { id: "uploaded", version: 1 };
  const refreshedFirst = { id: "first", version: 2 };

  const merged = mergeMaterialOrder(
    [second, first],
    [refreshedFirst, second, uploaded],
  );

  assert.deepEqual(merged.map(({ id }) => id), ["second", "first", "uploaded"]);
  assert.equal(merged[1], refreshedFirst);
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
