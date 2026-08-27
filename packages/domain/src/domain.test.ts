import assert from "node:assert/strict";
import test from "node:test";
import {
  addMaterial, addNarration, addScene, configureScene, createStillImageMotionPlan, createStory, evaluateStillImageMotion,
  focusDwellProgress, getLayoutOptions, mergeMaterialOrder, removeMaterial, removeScene, reorderMaterials, replaceMaterial, selectRenderer, setSceneTitle,
  transitionStory, verticalStoryFrame,
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

test("an applied material edit drives layout and motion without replacing source metadata", () => {
  const empty = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  const source = imageMaterial("photo", "landscape");
  const landscape = addMaterial(empty, "scene-1", source);
  const editedMaterial = {
    ...source,
    edit: {
      rotation: 90 as const,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      result: {
        storageKey: "photo-edited.jpg", mimeType: "image/jpeg", sizeBytes: 90,
        width: 100, height: 200, orientation: "portrait" as const,
      },
    },
  };
  const edited = replaceMaterial(landscape, "scene-1", editedMaterial);
  assert.equal(edited.scenes[0]?.materials[0]?.storageKey, source.storageKey);
  assert.equal(edited.scenes[0]?.materials[0]?.edit?.result?.storageKey, "photo-edited.jpg");
  assert.equal(edited.scenes[0]?.motion, "zoom-in");
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

test("one still-image plan centers the same focus for both pan directions", () => {
  const focusPoint = { x: 0.3, y: 0.5 };
  const sourceSize = { width: 1920, height: 1080 };
  const right = createStillImageMotionPlan({
    sourceSize, frameSize: verticalStoryFrame, orientation: "landscape", motion: "pan-right", focusPoint,
  });
  const left = createStillImageMotionPlan({
    sourceSize, frameSize: verticalStoryFrame, orientation: "landscape", motion: "pan-left", focusPoint,
  });
  assert.equal(right.kind, "pan");
  assert.equal(left.kind, "pan");
  assert.ok(Math.abs(right.baseCrop.x.progress - left.baseCrop.x.progress) < 1e-9);
  assert.ok(Math.abs(right.easing.at + left.easing.at - 1) < 1e-9);

  const rightDwell = evaluateStillImageMotion(right, right.easing.at);
  const leftDwell = evaluateStillImageMotion(left, left.easing.at);
  const rightCenteredSourceX = (0.5 - rightDwell.offsetX) / right.geometry.width;
  const leftCenteredSourceX = (0.5 - leftDwell.offsetX) / left.geometry.width;
  assert.ok(Math.abs(rightCenteredSourceX - focusPoint.x) < 1e-9);
  assert.ok(Math.abs(leftCenteredSourceX - focusPoint.x) < 1e-9);
  assert.throws(() => createStillImageMotionPlan({
    sourceSize, frameSize: verticalStoryFrame, orientation: "portrait", motion: "pan-right", focusPoint,
  }), /not valid for a portrait image/);
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

test("removing a scene also removes narrations anchored to it", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addScene(story, "scene-2");
  story = addNarration(story, { id: "voice-1", assetId: "audio-1", fromSceneId: "scene-1" });
  const changed = removeScene(story, "scene-1");
  assert.deepEqual(changed.scenes.map(({ id }) => id), ["scene-2"]);
  assert.deepEqual(changed.narrations, []);
});
