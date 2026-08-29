import assert from "node:assert/strict";
import test from "node:test";
import {
  addMaterial, addNarration, addScene, configureScene, createStillImageMotionPlan, createStory, evaluateStillImageMotion,
  focusDwellProgress, getLayoutOptions, mergeMaterialOrder, removeMaterial, removeScene, reorderMaterials, replaceMaterial, selectRenderer, setSceneTitle,
  buildStoryTimeline, getSceneDurationSeconds, moveSceneMaterials, reorderScenes, transitionStory, verticalStoryFrame,
  type Story, type VideoMaterial,
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

test("scene order persists explicitly without invalidating independent renders or narration anchors", () => {
  let story = addScene(addScene(createStory({ id: "story", profileId: "profile" }), "a"), "b");
  story = addNarration(story, { id: "voice", assetId: "audio", fromSceneId: "a" });
  story = { ...story, status: "ready", music: { generationStatus: "ready", assetId: "music", applied: true } };
  const changed = reorderScenes(story, ["b", "a"]);
  assert.deepEqual(changed.scenes, [story.scenes[1], story.scenes[0]]);
  assert.equal(changed.scenes[0], story.scenes[1]);
  assert.equal(changed.narrations, story.narrations);
  assert.equal(changed.revision, story.revision + 1);
  assert.equal(changed.status, "draft");
  assert.deepEqual(changed.music, { ...story.music, applied: false });
  assert.deepEqual(story.scenes.map(({ id }) => id), ["a", "b"]);
  for (const order of [[], ["a"], ["a", "a"], ["a", "missing"], ["a", "b", "c"]]) {
    assert.throws(() => reorderScenes(story, order));
  }
  assert.throws(() => reorderScenes({ ...story, status: "rendering" }, ["b", "a"]), /cannot be edited/);
  assert.deepEqual(reorderScenes(createStory({ id: "empty", profileId: "profile" }), []).scenes, []);
});

test("batch transfer preserves media metadata and resets only the two affected presentations in one revision", () => {
  let story = addScene(addScene(addScene(createStory({ id: "story", profileId: "profile" }), "a"), "b"), "c");
  for (const id of ["p1", "p2", "p3"]) story = addMaterial(story, "a", imageMaterial(id, "portrait"));
  story = addMaterial(story, "b", imageMaterial("p4", "portrait"));
  story = addNarration(story, { id: "voice", assetId: "audio", fromSceneId: "a" });
  const original = structuredClone(story);
  const changed = moveSceneMaterials(story, "a", { materialIds: ["p3", "p1"], targetSceneId: "b", targetIndex: 1 });
  assert.deepEqual(changed.scenes[0]!.materials.map(({ id }) => id), ["p2"]);
  assert.deepEqual(changed.scenes[1]!.materials.map(({ id }) => id), ["p4", "p3", "p1"]);
  assert.equal(changed.scenes[1]!.materials[1], story.scenes[0]!.materials[2]);
  assert.equal(changed.scenes[2], story.scenes[2]);
  assert.equal(changed.scenes[0]!.rendererId, "still-image");
  assert.equal(changed.scenes[1]!.rendererId, undefined);
  assert.deepEqual(changed.scenes.slice(0, 2).map(({ render }) => render), [{ status: "idle" }, { status: "idle" }]);
  assert.equal(changed.revision, story.revision + 1);
  assert.equal(changed.narrations, story.narrations);
  assert.deepEqual(story, original);
  const input = { materialIds: ["p1"], targetSceneId: "b", targetIndex: 0 };
  for (const invalid of [
    { ...input, materialIds: [] }, { ...input, materialIds: ["p1", "p1"] }, { ...input, materialIds: ["p1", "missing"] },
    { ...input, targetSceneId: "a" }, { ...input, targetSceneId: "missing" },
    ...[-1, 2, 0.5, NaN].map((targetIndex) => ({ ...input, targetIndex })),
  ]) assert.throws(() => moveSceneMaterials(story, "a", invalid));
  assert.deepEqual(story, original);
});

test("moving the last image away leaves the source and its narration, and never leaves a photo renderer on video", () => {
  let story = addScene(addScene(createStory({ id: "story", profileId: "profile" }), "a"), "b");
  story = addMaterial(story, "a", imageMaterial("image", "portrait"));
  story = addMaterial(story, "a", timelineVideo("video", 42));
  story = selectRenderer(story, "a", "still-image");
  story = addNarration(story, { id: "voice", assetId: "audio", fromSceneId: "b" });
  const moved = moveSceneMaterials(story, "a", { materialIds: ["image"], targetSceneId: "b", targetIndex: 0 });
  assert.equal(moved.scenes[0]!.rendererId, undefined);
  assert.equal(moved.scenes[0]!.focusPoint, undefined);
  assert.equal(moved.scenes[1]!.rendererId, "still-image");
  const emptied = moveSceneMaterials(moved, "b", { materialIds: ["image"], targetSceneId: "a", targetIndex: 0 });
  assert.deepEqual(emptied.scenes[1]!.materials, []);
  assert.equal(emptied.narrations[0]!.fromSceneId, "b");
  assert.equal(emptied.scenes.length, 2);
});

test("timeline uses configured photo/layout timing, original video duration and trims without shortening", () => {
  let story = timelineStory();
  story = addMaterial(story, "photo", imageMaterial("another", "portrait"));
  const timeline = buildStoryTimeline(story);
  assert.deepEqual(timeline.scenes.map(({ startSeconds, endSeconds, durationSource }) => [startSeconds, endSeconds, durationSource]), [
    [0, 5, "scene"], [5, 185.25, "video"], [185.25, 187.75, "trim"],
  ]);
  assert.equal(timeline.totalDurationSeconds, 187.75);
  assert.equal(timeline.transitionOverlapSeconds, 0);
  assert.deepEqual(timeline.warnings, []);
  assert.equal(buildStoryTimeline(reorderScenes(story, ["trim", "photo", "video"])).totalDurationSeconds, 187.75);
  assert.equal(story.scenes[1]!.durationSeconds, 5);
});

test("empty and unknown-duration scenes never fabricate footage or downstream timestamps", () => {
  const story = addScene(timelineStory(), "empty");
  const video = timelineVideo("legacy");
  const unknown: Story = { ...story, scenes: story.scenes.map((scene) => scene.id === "video" ? { ...scene, materials: [video] } : scene) };
  const timeline = buildStoryTimeline(unknown, [{ formatId: "test", maxDurationSeconds: 6, requiresVerifiedAccount: false }]);
  assert.equal(timeline.totalDurationSeconds, null);
  assert.equal(timeline.knownDurationSeconds, 7.5);
  assert.equal(timeline.scenes[1]!.startSeconds, 5);
  assert.equal(timeline.scenes[1]!.endSeconds, null);
  assert.equal(timeline.scenes[2]!.startSeconds, null);
  assert.equal(timeline.scenes[3]!.durationSeconds, 0);
  assert.deepEqual(timeline.warnings, [
    { code: "unknown_video_duration", sceneId: "video" }, { code: "empty_scene", sceneId: "empty" },
  ]);
  assert.equal(timeline.formatLimits[0]!.status, "exceeded");
  assert.equal(timeline.formatLimits[0]!.excessSeconds, 1.5);
  assert.equal(timeline.formatLimits[0]!.isLowerBound, true);
  assert.equal(buildStoryTimeline(unknown, [{ formatId: "test", maxDurationSeconds: 180, requiresVerifiedAccount: false }]).formatLimits[0]!.status, "unknown");
  const trackVideo = { ...video, videoTrack: { storageKey: "track.mp4", mimeType: "video/mp4", sizeBytes: 100, durationSeconds: 12.5 } };
  assert.equal(getSceneDurationSeconds({ ...unknown.scenes[1]!, materials: [trackVideo] }), 12.5);
});

test("duration warnings are advisory, include exact excess and accept a duration exactly at the limit", () => {
  const story = timelineStory();
  const before = structuredClone(story);
  const limits = [180, 187.75, 900].map((maxDurationSeconds) => ({ formatId: String(maxDurationSeconds), maxDurationSeconds, requiresVerifiedAccount: false }));
  assert.deepEqual(buildStoryTimeline(story, limits).formatLimits.map(({ status, excessSeconds }) => [status, excessSeconds]), [
    ["exceeded", 7.75], ["within_limit", 0], ["within_limit", 0],
  ]);
  assert.deepEqual(story, before);
  assert.equal(buildStoryTimeline(createStory({ id: "empty", profileId: "profile" })).totalDurationSeconds, 0);
});

function timelineVideo(id: string, sourceDurationSeconds?: number): VideoMaterial {
  return { ...fileMetadata(id, "landscape"), kind: "video", hasAudio: false, audioTags: [],
    ...(sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds }) };
}

function timelineStory(): Story {
  let story = createStory({ id: "story", profileId: "profile" });
  for (const id of ["photo", "video", "trim"]) story = addScene(story, id);
  story = addMaterial(story, "photo", imageMaterial("image", "portrait"));
  story = addMaterial(story, "video", timelineVideo("full", 180.25));
  return addMaterial(story, "trim", { ...timelineVideo("trimmed", 20), edit: {
    rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 3.25, endSeconds: 5.75 },
  } });
}
