import assert from "node:assert/strict";
import test from "node:test";
import {
  addMaterial, addNarration, addScene, configureScene, createStillImageMotionPlan, createStory, evaluateStillImageMotion,
  focusDwellProgress, getLayoutOptions, mergeMaterialOrder, removeMaterial, removeScene, reorderMaterials, replaceMaterial, selectRenderer, setSceneTitle,
  setCollageBackground,
  buildStoryTimeline, collageCardMaterials, collageCardShadow, collageLayoutDefinitions, collageLayoutMaterials,
  collageCardAngleDefaultMaximumDegrees, collageCardAngleMinimumDegrees,
  createCollageCardAngles, createCollageCardOffsets, createCollageEntranceSchedule, createTornPaperClipPath, createTornPaperInnerFramePath,
  defaultCollageSettings,
  getCollageCardShadowMetrics, getCollageLayoutDefinition, getCollageLayoutOptions, getCollagePauseDurationSeconds,
  getImplementedCollageOrientationSequences, getSceneDurationSeconds,
  materialOrientationSequence,
  moveSceneMaterials, reorderScenes, resolveCollageSettings, tornPaperEdgeParameters, tornPaperInnerEdgeParameters,
  transitionStory, verticalStoryFrame,
  normalizeFrameRate, parseFrameRate,
  type CollageSettings, type Story, type VideoMaterial,
} from "./index.js";

test("a render starts only when every scene has material and a renderer", () => {
  const draft = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  assert.throws(() => transitionStory(draft, "rendering"), /material and a renderer/);
  const withMaterial = addMaterial(draft, "scene-1", imageMaterial("photo", "portrait"));
  const readyToRender = selectRenderer(withMaterial, "scene-1", "still-image");
  assert.equal(transitionStory(readyToRender, "rendering").status, "rendering");
});

test("material order and format validators determine layout choices", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("p1", "portrait"));
  story = addMaterial(story, "scene-1", imageMaterial("p2", "portrait"));
  story = addMaterial(story, "scene-1", {
    ...fileMetadata("l1", "landscape"), kind: "video", hasAudio: true, audioTags: ["voice", "ambient"],
    sourceDurationSeconds: 12,
  });
  assert.deepEqual(getCollageLayoutOptions(story.scenes[0]!.materials).map(({ id }) => id), ["2+1"]);
  assert.deepEqual(getLayoutOptions(story.scenes[0]!.materials).map(({ id }) => id), ["2+1"]);
  const configured = configureScene(story, "scene-1", { layoutId: "2+1" });
  assert.equal(configured.scenes[0]?.rendererId, "collage");
  assert.equal(configured.scenes[0]?.layoutId, "2+1");
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
  assert.equal(layout.scenes[0]?.rendererId, "collage");
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
  assert.throws(() => configureScene(story, "scene-1", { layoutId: "overlap-stack" }), /not available/);
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
  assert.equal(getCollageLayoutOptions(materials).length, 4);
  assert.equal(getLayoutOptions(materials).length, 4);
});

test("each six-portrait layout owns its final grouping and stop order", () => {
  const materials = Array.from({ length: 6 }, (_, index) => imageMaterial(`p${index}`, "portrait"));
  const sources = collageLayoutMaterials(materials);
  const settings = defaultCollageSettings(materials);
  const pairAscendingSettings = {
    ...settings,
    cardOffsets: createCollageCardOffsets({
      layoutId: "portrait-pairs-descending", materials, direction: "ascending", seedKey: "row-geometry",
    }),
  };
  const descending = createCollageEntranceSchedule({
    layoutId: "portrait-pairs-descending", layoutRendererId: "animated-collage.portrait-pairs-descending.v1",
    layoutOverlapRatio: getCollageLayoutDefinition("portrait-pairs-descending")!.overlapRatio,
    materials: sources, width: 1080, height: 1920, settings: pairAscendingSettings,
  });
  const ascending = createCollageEntranceSchedule({
    layoutId: "portrait-pairs-ascending", layoutRendererId: "animated-collage.portrait-pairs-ascending.v1",
    layoutOverlapRatio: getCollageLayoutDefinition("portrait-pairs-ascending")!.overlapRatio,
    materials: sources, width: 1080, height: 1920, settings: {
      ...settings,
      cardOffsets: createCollageCardOffsets({
        layoutId: "portrait-pairs-ascending", materials, direction: "ascending", seedKey: "row-geometry",
      }),
    },
  });
  const triples = createCollageEntranceSchedule({
    layoutId: "portrait-triples-descending", layoutRendererId: "animated-collage.portrait-triples-descending.v1",
    layoutOverlapRatio: getCollageLayoutDefinition("portrait-triples-descending")!.overlapRatio,
    materials: sources, width: 1080, height: 1920, settings: {
      ...settings,
      cardOffsets: createCollageCardOffsets({
        layoutId: "portrait-triples-descending", materials, direction: "ascending", seedKey: "row-geometry",
      }),
    },
  });
  const rowDescending = createCollageEntranceSchedule({
    layoutId: "portrait-pairs-descending", layoutRendererId: "animated-collage.portrait-pairs-descending.v1",
    layoutOverlapRatio: getCollageLayoutDefinition("portrait-pairs-descending")!.overlapRatio,
    materials: sources, width: 1080, height: 1920, settings: {
      ...settings,
      rowDirection: "descending",
      cardOffsets: createCollageCardOffsets({
        layoutId: "portrait-pairs-descending", materials, direction: "descending", seedKey: "row-geometry-descending",
      }),
    },
  });
  assert.ok(descending[0]!.endSeconds < descending.at(-1)!.endSeconds);
  assert.ok(ascending[0]!.endSeconds > ascending.at(-1)!.endSeconds);
  assert.deepEqual(descending.map(({ stackOrder }) => stackOrder), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(ascending.map(({ stackOrder }) => stackOrder), [4, 5, 2, 3, 0, 1]);
  assertEntrancesStartOutsideScene(descending, 1080, 1920);
  assertEntrancesStartOutsideScene(ascending, 1080, 1920);
  assert.notEqual(descending[0]!.width, triples[0]!.width);
  assert.ok(descending[1]!.x < descending[0]!.x + descending[0]!.width);
  for (let row = 0; row < 3; row += 1) {
    const pair = descending.slice(row * 2, row * 2 + 2);
    const occupiedWidth = Math.max(...pair.map(({ x, width }) => x + width)) - Math.min(...pair.map(({ x }) => x));
    assert.ok(occupiedWidth >= 1080 * 0.8, "portrait pairs must use the available scene width");
    const ascendingDifference = cardCenterY(pair[0]!) - cardCenterY(pair[1]!);
    const descendingDifference = cardCenterY(rowDescending[row * 2]!) - cardCenterY(rowDescending[row * 2 + 1]!);
    assert.ok(ascendingDifference >= 20 && ascendingDifference <= 40,
      "the default row must rise left-to-right by 20–40 output pixels");
    assert.ok(descendingDifference <= -20 && descendingDifference >= -40,
      "the descending setting must calculate its own saved 20–40 px fall");
  }
  for (const rowStart of [0, 3]) {
    for (let column = 0; column < 2; column += 1) {
      const difference = cardCenterY(triples[rowStart + column]!) - cardCenterY(triples[rowStart + column + 1]!);
      assert.ok(difference >= 20 && difference <= 40, "every adjacent card in a triple must use the calibrated rise");
    }
  }
  assert.deepEqual(
    createCollageEntranceSchedule({
      layoutId: "portrait-pairs-descending", layoutRendererId: "animated-collage.portrait-pairs-descending.v1",
      layoutOverlapRatio: getCollageLayoutDefinition("portrait-pairs-descending")!.overlapRatio,
      materials: sources, width: 1080, height: 1920, settings: pairAscendingSettings,
    }).map(cardCenterY),
    descending.map(cardCenterY),
    "the persisted vertical offsets must stay stable between render schedule calls",
  );
});

function cardCenterY(card: { readonly y: number; readonly height: number }): number {
  return card.y + card.height / 2;
}

test("each collage layout owns a format/sequence validator, renderer and editor association", () => {
  assert.equal(new Set(collageLayoutDefinitions.map(({ renderer }) => renderer.id)).size, collageLayoutDefinitions.length);
  assert.equal(new Set(collageLayoutDefinitions.map(({ renderer }) => renderer.createSchedule)).size, collageLayoutDefinitions.length);
  assert.ok(collageLayoutDefinitions.every((layout) => layout.rowSizes.reduce((sum, size) => sum + size, 0)
    === layout.requirements.orientationSequence.length));
  assert.ok(collageLayoutDefinitions.every(({ overlapRatio }) => overlapRatio >= 0.3 && overlapRatio <= 0.5));
  assert.deepEqual(new Set(collageLayoutDefinitions.map(({ editorId }) => editorId)), new Set([
    "paper-stack", "paper-rows", "paper-cascade",
  ]));
  assert.deepEqual(getImplementedCollageOrientationSequences(), [
    "ll", "ppl", "pppp", "ppll", "pplpp", "ppppl", "ppppll", "pppppp",
  ]);
  const stack = getCollageLayoutDefinition("stack")!;
  const images = collageLayoutMaterials([imageMaterial("l1", "landscape"), imageMaterial("l2", "landscape")]);
  assert.deepEqual(stack.validate(images), { valid: true });
  assert.deepEqual(stack.validate([{ ...images[0]!, kind: "video" }, images[1]!]), { valid: true });
  const stackSettings = defaultCollageSettings([imageMaterial("l1", "landscape"), imageMaterial("l2", "landscape")]);
  const stackInput = { materials: images, width: 1080, height: 1920, settings: stackSettings };
  assert.deepEqual(
    stack.renderer.createSchedule(stackInput),
    stack.renderer.createSchedule({
      ...stackInput,
      settings: { ...stackSettings, overlapRatio: 0.3 } as CollageSettings & { overlapRatio: number },
    }),
    "even a stale settings object cannot override layout-owned overlap",
  );
  for (const layout of collageLayoutDefinitions) {
    assert.deepEqual(layout.requirements.materialKinds, ["image", "video"]);
    const mixedMaterials = [...layout.requirements.orientationSequence].map((orientation, index) => ({
      id: `${layout.id}-${index}`,
      kind: index % 2 === 0 ? "video" as const : "image" as const,
      width: orientation === "p" ? 900 : 1600,
      height: orientation === "p" ? 1600 : 900,
    }));
    assert.deepEqual(layout.validate(mixedMaterials), { valid: true }, `${layout.id} must accept mixed media`);
  }
  assert.deepEqual(stack.validate(collageLayoutMaterials([
    imageMaterial("p1", "portrait"), imageMaterial("l2", "landscape"),
  ])), { valid: false, code: "orientation-sequence", expected: "ll", actual: "pl" });
  assert.throws(() => createCollageEntranceSchedule({
    layoutId: stack.id,
    layoutRendererId: "animated-collage.wrong.v1",
    layoutOverlapRatio: stack.overlapRatio,
    materials: images,
    width: 1080,
    height: 1920,
    settings: stackSettings,
  }), /renderer does not match/);
});

test("animated collage catalog does not add a generic layout to exact or unsupported sequences", () => {
  assert.deepEqual(getCollageLayoutOptions([
    imageMaterial("p1", "portrait"), imageMaterial("p2", "portrait"), imageMaterial("l1", "landscape"),
  ]).map(({ id }) => id), ["2+1"]);
  assert.deepEqual(getCollageLayoutOptions([
    imageMaterial("p1", "portrait"), imageMaterial("l1", "landscape"),
  ]).map(({ id }) => id), []);
});

test("collage orientation follows the displayed crop rather than original metadata", () => {
  const cropped = {
    ...imageMaterial("wide-cropped", "landscape"),
    width: 400,
    height: 200,
    edit: { rotation: 0 as const, crop: { x: 0.4, y: 0, width: 0.2, height: 1 } },
  };
  assert.equal(cropped.orientation, "landscape");
  assert.equal(materialOrientationSequence([cropped, imageMaterial("wide", "landscape")]), "pl");
  const withDerivative = {
    ...cropped,
    edit: { ...cropped.edit, result: {
      storageKey: "wide-cropped-edited.jpg", mimeType: "image/jpeg", sizeBytes: 80,
      width: 80, height: 200, orientation: "portrait" as const,
    } },
  };
  assert.equal(materialOrientationSequence([withDerivative, imageMaterial("wide", "landscape")]), "pl");
  const rotatedAndCropped = {
    ...imageMaterial("rotated", "landscape"), width: 400, height: 200,
    edit: { rotation: 90 as const, crop: { x: 0, y: 0.4, width: 1, height: 0.2 } },
  };
  assert.equal(materialOrientationSequence([rotatedAndCropped]), "l");
});

test("animated collage preserves each cropped photo aspect and shares layout timing", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("wide-1", "landscape"));
  story = addMaterial(story, "scene-1", imageMaterial("wide-2", "landscape"));
  const scene = story.scenes[0]!;
  assert.equal(scene.rendererId, "collage");
  assert.deepEqual(scene.collageBackground, { source: "previous-scene" });
  assert.deepEqual(scene.collage, {
    frame: { width: 12, color: "#FFFFFF", shape: "straight" },
    entryDurationSeconds: 4,
    rowDirection: "ascending",
    straightCards: false,
    cardAngles: scene.collage?.cardAngles,
    cardOffsets: scene.collage?.cardOffsets,
  });
  assert.deepEqual(scene.collage?.cardAngles.map(({ materialId }) => materialId), ["wide-1", "wide-2"]);
  assert.ok(scene.collage!.cardAngles.every(({ angleDegrees }) => Math.abs(angleDegrees) >= collageCardAngleMinimumDegrees
    && Math.abs(angleDegrees) <= collageCardAngleDefaultMaximumDegrees));
  const legacySettings = { ...scene.collage!, pauseDurationSeconds: 1, overlapRatio: 0.49 } as CollageSettings & {
    pauseDurationSeconds: number; overlapRatio: number;
  };
  const normalizedLegacy = resolveCollageSettings(scene.materials, legacySettings, 5);
  assert.equal("pauseDurationSeconds" in normalizedLegacy, false);
  assert.equal("overlapRatio" in normalizedLegacy, false);
  const { rowDirection: _legacyDirection, ...legacyWithoutDirection } = scene.collage!;
  assert.equal(resolveCollageSettings(scene.materials, legacyWithoutDirection, 5).rowDirection, "ascending");
  const legacyZeroWidth = resolveCollageSettings(scene.materials, {
    ...scene.collage!, frame: { ...scene.collage!.frame, width: 0 },
  }, 5);
  assert.deepEqual(legacyZeroWidth.frame, { width: 12, color: "#FFFFFF", shape: "none" });
  const legacyIntermediateWidth = resolveCollageSettings(scene.materials, {
    ...scene.collage!, frame: { ...scene.collage!.frame, width: 18 },
  }, 5);
  assert.equal(legacyIntermediateWidth.frame.width, 16);
  assert.deepEqual(getCollageCardShadowMetrics(1080), {
    offsetX: 0, offsetY: 15, blurSigma: 20.52, padding: 77,
  });
  assert.equal(collageCardShadow.opacity, 0.4);
  const configured = configureScene(story, "scene-1", { layoutId: "stack", collage: {
    ...scene.collage!, frame: { width: 16, color: "#aabbcc", shape: "torn" },
  } });
  assert.deepEqual(configured.scenes[0]?.collage?.frame, { width: 16, color: "#AABBCC", shape: "torn" });
  const schedule = createCollageEntranceSchedule({
    layoutId: "stack", layoutRendererId: "animated-collage.stack.v1",
    layoutOverlapRatio: getCollageLayoutDefinition("stack")!.overlapRatio,
    width: 1080, height: 1920, settings: configured.scenes[0]!.collage!,
    materials: [
      { id: "wide-1", kind: "image", width: 200, height: 100 },
      { id: "wide-2", kind: "image", width: 200, height: 100 },
    ],
  });
  assert.equal(schedule[0]?.direction, "bottom");
  assert.equal(schedule[1]?.direction, "bottom");
  assert.equal(schedule[1]?.endSeconds, 4);
  assert.ok(schedule.every(({ startAngleDegrees }) => Math.abs(startAngleDegrees) >= 25 && Math.abs(startAngleDegrees) <= 45));
  assert.deepEqual(schedule.map(({ finalAngleDegrees }) => finalAngleDegrees),
    configured.scenes[0]!.collage!.cardAngles.map(({ angleDegrees }) => angleDegrees));
  assert.ok(schedule[1]!.y < schedule[0]!.y + schedule[0]!.height, "the final cards must overlap");
  assertEntrancesStartOutsideScene(schedule, 1080, 1920);
  assert.ok(Math.abs((schedule[0]!.width - 32) / (schedule[0]!.height - 32) - 2) < 0.01,
    "the full cropped photo aspect must remain intact inside its frame");
  const longer = configureScene(configured, "scene-1", { durationSeconds: 7 });
  assert.equal(longer.scenes[0]?.collage?.entryDurationSeconds, 4);
  assert.equal(getCollagePauseDurationSeconds(longer.scenes[0]!.collage!, longer.scenes[0]!.durationSeconds), 3);
  assert.throws(() => configureScene(configured, "scene-1", { collage: {
    ...configured.scenes[0]!.collage!, entryDurationSeconds: 4.5,
  } }), /leave at least 1 second/);
  assert.equal("overlapRatio" in configured.scenes[0]!.collage!, false,
    "card overlap belongs to the selected layout rather than editable scene settings");
});

function assertEntrancesStartOutsideScene(
  entrances: ReturnType<typeof createCollageEntranceSchedule>,
  width: number,
  height: number,
): void {
  const shadowPadding = getCollageCardShadowMetrics(width).padding;
  entrances.forEach((entrance) => {
    const radians = entrance.startAngleDegrees * Math.PI / 180;
    const rotatedWidth = entrance.width * Math.abs(Math.cos(radians)) + entrance.height * Math.abs(Math.sin(radians));
    const rotatedHeight = entrance.width * Math.abs(Math.sin(radians)) + entrance.height * Math.abs(Math.cos(radians));
    const centerX = entrance.x + entrance.startOffsetX + entrance.width / 2;
    const centerY = entrance.y + entrance.startOffsetY + entrance.height / 2;
    if (entrance.direction === "left") {
      assert.ok(centerX + rotatedWidth / 2 + shadowPadding <= 0, "left entrance must start fully outside the scene");
    } else if (entrance.direction === "right") {
      assert.ok(centerX - rotatedWidth / 2 - shadowPadding >= width, "right entrance must start fully outside the scene");
    } else {
      assert.ok(centerY - rotatedHeight / 2 - shadowPadding >= height, "bottom entrance must start fully outside the scene");
    }
  });
}

test("collage resting angles and offsets follow row geometry, persist in JSON and remain hidden implementation data", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("left", "portrait"));
  story = addMaterial(story, "scene-1", imageMaterial("right", "portrait"));
  story = addMaterial(story, "scene-1", imageMaterial("single", "landscape"));
  const automatic = story.scenes[0]!;
  assert.equal(automatic.layoutId, undefined);
  assert.equal(automatic.collage?.cardAngles[0]?.materialId, "left");
  assert.ok(automatic.collage!.cardAngles[0]!.angleDegrees < 0, "the left card in a pair must lean left");
  assert.ok(automatic.collage!.cardAngles[1]!.angleDegrees > 0, "the right card in a pair must lean right");
  assert.ok(Math.abs(automatic.collage!.cardAngles[2]!.angleDegrees) >= collageCardAngleMinimumDegrees);
  const persistedAngles = automatic.collage!.cardAngles;
  const persistedOffsets = automatic.collage!.cardOffsets;
  assert.deepEqual(persistedOffsets.map(({ materialId }) => materialId), ["left", "right", "single"]);
  assertAdjacentOffset(automatic.collage!, "left", "right", -1);
  assert.equal(persistedOffsets.find(({ materialId }) => materialId === "single")?.offsetY, 0);

  const reframed = configureScene(story, "scene-1", { collage: {
    frame: { ...automatic.collage!.frame, color: "#EEEEDD" },
    entryDurationSeconds: automatic.collage!.entryDurationSeconds,
    straightCards: automatic.collage!.straightCards,
  } });
  assert.deepEqual(reframed.scenes[0]!.collage!.cardAngles, persistedAngles,
    "frame edits must not silently randomize the final composition");
  assert.deepEqual(reframed.scenes[0]!.collage!.cardOffsets, persistedOffsets,
    "frame edits must preserve the persisted per-card vertical offsets");

  const reseeded = configureScene(reframed, "scene-1", { collage: {
    frame: reframed.scenes[0]!.collage!.frame,
    entryDurationSeconds: reframed.scenes[0]!.collage!.entryDurationSeconds,
    straightCards: reframed.scenes[0]!.collage!.straightCards,
    rowDirection: "ascending",
  } });
  assert.notDeepEqual(reseeded.scenes[0]!.collage!.cardOffsets, persistedOffsets,
    "choosing a row mode explicitly must calculate and persist a fresh random distance");
  assertAdjacentOffset(reseeded.scenes[0]!.collage!, "left", "right", -1);

  const level = configureScene(reseeded, "scene-1", { collage: {
    frame: reseeded.scenes[0]!.collage!.frame,
    entryDurationSeconds: reseeded.scenes[0]!.collage!.entryDurationSeconds,
    straightCards: reseeded.scenes[0]!.collage!.straightCards,
    rowDirection: "level",
  } });
  assert.deepEqual(level.scenes[0]!.collage!.cardOffsets.map(({ offsetY }) => offsetY), [0, 0, 0]);

  const descending = configureScene(level, "scene-1", { collage: {
    frame: level.scenes[0]!.collage!.frame,
    entryDurationSeconds: level.scenes[0]!.collage!.entryDurationSeconds,
    straightCards: level.scenes[0]!.collage!.straightCards,
    rowDirection: "descending",
  } });
  assertAdjacentOffset(descending.scenes[0]!.collage!, "left", "right", 1);

  const straight = configureScene(reframed, "scene-1", { collage: {
    frame: reframed.scenes[0]!.collage!.frame,
    entryDurationSeconds: reframed.scenes[0]!.collage!.entryDurationSeconds,
    straightCards: true,
  } });
  assert.equal(straight.scenes[0]!.collage!.straightCards, true);
  assert.deepEqual(straight.scenes[0]!.collage!.cardAngles.map(({ angleDegrees }) => angleDegrees), [0, 0, 0]);

  const angled = configureScene(straight, "scene-1", { collage: {
    frame: straight.scenes[0]!.collage!.frame,
    entryDurationSeconds: straight.scenes[0]!.collage!.entryDurationSeconds,
    straightCards: false,
  } });
  assert.ok(angled.scenes[0]!.collage!.cardAngles.every(({ angleDegrees }) => angleDegrees !== 0));

  const removed = removeMaterial(angled, "scene-1", "single");
  assert.deepEqual(removed.scenes[0]!.collage?.cardAngles, [], "an unsupported sequence must not keep stale angles");
  assert.deepEqual(removed.scenes[0]!.collage?.cardOffsets, [], "an unsupported sequence must not keep stale offsets");
  const restored = addMaterial(removed, "scene-1", imageMaterial("single", "landscape"));
  assert.deepEqual(restored.scenes[0]!.collage!.cardAngles.map(({ materialId }) => materialId), ["left", "right", "single"]);
  assert.notDeepEqual(restored.scenes[0]!.collage!.cardAngles, angled.scenes[0]!.collage!.cardAngles,
    "adding material must calculate a new persisted composition");
  assert.deepEqual(restored.scenes[0]!.collage!.cardOffsets.map(({ materialId }) => materialId), ["left", "right", "single"]);
});

function assertAdjacentOffset(settings: CollageSettings, leftId: string, rightId: string, expectedSign: -1 | 1): void {
  const byMaterial = new Map(settings.cardOffsets.map(({ materialId, offsetY }) => [materialId, offsetY]));
  const difference = byMaterial.get(rightId)! - byMaterial.get(leftId)!;
  assert.equal(Math.sign(difference), expectedSign);
  assert.ok(Math.abs(difference) >= 20 && Math.abs(difference) <= 40);
}

test("a custom background is separate from collage cards and survives composition edits", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("left", "landscape"));
  story = addMaterial(story, "scene-1", imageMaterial("right", "landscape"));
  story = configureScene(story, "scene-1", { layoutId: "stack" });
  const background = {
    ...fileMetadata("background-video", "portrait"), kind: "video", hasAudio: true, audioTags: ["ambient"],
    sourceDurationSeconds: 8,
  } satisfies VideoMaterial;
  const withBackground = setCollageBackground(story, "scene-1", { source: "material", material: background });
  const scene = withBackground.scenes[0]!;
  assert.equal(scene.layoutId, "stack");
  assert.deepEqual(collageCardMaterials(scene.materials, scene.collage!).map(({ id }) => id), ["left", "right"]);
  assert.deepEqual(scene.collage!.cardAngles.map(({ materialId }) => materialId), ["left", "right"]);
  assert.ok(scene.collage!.cardAngles.every(({ materialId }) => materialId !== "background-video"));
  assert.deepEqual(scene.collageBackground, { source: "material", material: background });

  const reframed = configureScene(withBackground, "scene-1", { collage: {
    frame: { ...scene.collage!.frame, width: 24 },
    entryDurationSeconds: scene.collage!.entryDurationSeconds,
  } });
  assert.deepEqual(reframed.scenes[0]!.collageBackground, { source: "material", material: background });
  assert.equal(reframed.scenes[0]!.collage!.frame.width, 24);
  const previous = setCollageBackground(reframed, "scene-1", { source: "previous-scene" });
  assert.deepEqual(previous.scenes[0]!.collageBackground, { source: "previous-scene" });
  assert.deepEqual(previous.scenes[0]!.collage!.cardAngles, reframed.scenes[0]!.collage!.cardAngles);
});

test("manual six-card layouts calculate pair or triple resting angles when selected", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  for (let index = 0; index < 6; index += 1) {
    story = addMaterial(story, "scene-1", imageMaterial(`p${index}`, "portrait"));
  }
  assert.equal(story.scenes[0]!.layoutId, undefined);
  assert.deepEqual(story.scenes[0]!.collage!.cardAngles, []);

  const pairs = configureScene(story, "scene-1", { layoutId: "portrait-pairs-descending" });
  const pairAngles = pairs.scenes[0]!.collage!.cardAngles.map(({ angleDegrees }) => angleDegrees);
  for (let index = 0; index < pairAngles.length; index += 2) {
    assert.ok(pairAngles[index]! < 0);
    assert.ok(pairAngles[index + 1]! > 0);
  }

  const triples = configureScene(pairs, "scene-1", { layoutId: "portrait-triples-descending" });
  assert.deepEqual(triples.scenes[0]!.collage!.cardAngles.map(({ materialId }) => materialId),
    triples.scenes[0]!.materials.map(({ id }) => id));
  assert.ok(triples.scenes[0]!.collage!.cardAngles.every(({ angleDegrees }) =>
    Math.abs(angleDegrees) >= collageCardAngleMinimumDegrees
    && Math.abs(angleDegrees) <= collageCardAngleDefaultMaximumDegrees));

  const materials = triples.scenes[0]!.materials;
  const observedSigns = new Set(Array.from({ length: 32 }, (_, index) => createCollageCardAngles({
    layoutId: "portrait-triples-descending", materials, straightCards: false, seedKey: `sign-seed-${index}`,
  })).flat().map(({ angleDegrees }) => Math.sign(angleDegrees)));
  assert.deepEqual(observedSigns, new Set([-1, 1]), "single and triple rows must choose either sign from their seed");

  const randomSigns = new Set(Array.from({ length: 32 }, (_, index) => createCollageCardOffsets({
    layoutId: "portrait-pairs-descending", materials, direction: "random", seedKey: `offset-seed-${index}`,
  })).flatMap((offsets) => [0, 2, 4].map((leftIndex) => Math.sign(offsets[leftIndex + 1]!.offsetY - offsets[leftIndex]!.offsetY))));
  assert.deepEqual(randomSigns, new Set([-1, 1]), "irregular multi-row compositions must seed both vertical directions");
});

test("every persisted angled layout still fits its final rotated cards inside the story frame", () => {
  for (const layout of collageLayoutDefinitions) {
    const materials = [...layout.requirements.orientationSequence].map((orientation, index) =>
      imageMaterial(`${layout.id}-${index}`, orientation === "p" ? "portrait" : "landscape"));
    const settings = {
      ...defaultCollageSettings(materials),
      cardAngles: createCollageCardAngles({
        layoutId: layout.id, materials, straightCards: false, seedKey: "layout-fit",
      }),
      cardOffsets: createCollageCardOffsets({
        layoutId: layout.id, materials, direction: "ascending", seedKey: "layout-fit",
      }),
    };
    const schedule = createCollageEntranceSchedule({
      layoutId: layout.id,
      layoutRendererId: layout.renderer.id,
      layoutOverlapRatio: layout.overlapRatio,
      materials: collageLayoutMaterials(materials),
      width: 1080,
      height: 1920,
      settings,
    });
    assert.equal(schedule.length, materials.length);
    assert.deepEqual([...schedule.map(({ stackOrder }) => stackOrder)].sort((left, right) => left - right),
      Array.from({ length: materials.length }, (_, index) => index));
    assert.ok(schedule.every(({ x, y, width, height }) => x >= 0 && y >= 0 && x + width <= 1080 && y + height <= 1920));
  }
});

test("a square final crop in two-plus-one is reduced enough to keep its persisted angle inside the story frame", () => {
  const square = {
    ...imageMaterial("square", "landscape"),
    edit: {
      rotation: 0 as const,
      crop: { x: 0.21875, y: 0, width: 0.5625, height: 1 },
      result: {
        storageKey: "square-edited.jpg", mimeType: "image/jpeg", sizeBytes: 80,
        width: 900, height: 900, orientation: "landscape" as const,
      },
    },
  };
  const materials = [imageMaterial("left", "portrait"), imageMaterial("right", "portrait"), square];
  const layout = getCollageLayoutDefinition("2+1")!;
  const defaults = defaultCollageSettings(materials);
  const settings = {
    ...defaults,
    cardAngles: [
      { materialId: "left", angleDegrees: -4 },
      { materialId: "right", angleDegrees: 4 },
      { materialId: "square", angleDegrees: 5.4208 },
    ],
    cardOffsets: createCollageCardOffsets({
      layoutId: layout.id, materials, direction: defaults.rowDirection, seedKey: "square-crop-fit",
    }),
  };

  const card = createCollageEntranceSchedule({
    layoutId: layout.id,
    layoutRendererId: layout.renderer.id,
    layoutOverlapRatio: layout.overlapRatio,
    materials: collageLayoutMaterials(materials),
    width: 1080,
    height: 1920,
    settings,
  })[2]!;
  const radians = Math.abs(card.finalAngleDegrees) * Math.PI / 180;
  const rotatedWidth = Math.ceil(card.width * Math.cos(radians) + card.height * Math.sin(radians));
  const rotatedHeight = Math.ceil(card.width * Math.sin(radians) + card.height * Math.cos(radians));
  const insetX = Math.ceil((rotatedWidth - card.width) / 2);
  const insetY = Math.ceil((rotatedHeight - card.height) / 2);

  assert.equal(card.width, card.height, "the square crop must keep its full aspect after fitting");
  assert.ok(rotatedWidth <= 1080 && rotatedHeight <= 1920);
  assert.ok(card.x >= insetX && card.x + card.width + insetX <= 1080);
  assert.ok(card.y >= insetY && card.y + card.height + insetY <= 1920);
});

test("torn paper uses a deterministic fine-grained contour instead of a repeating wave", () => {
  const input = { width: 900, height: 600, frameWidth: 6, seed: 17_041 };
  const first = createTornPaperClipPath(input);
  assert.equal(first, createTornPaperClipPath(input));
  assert.notEqual(first, createTornPaperClipPath({ ...input, seed: input.seed + 1 }));
  assert.match(first, /^polygon\(/);
  assert.ok(first.split(",").length > 300, "the contour must retain the skill's sparse 9 px edge samples");
  assert.doesNotMatch(first, /NaN|Infinity/);
  assert.ok(tornPaperInnerEdgeParameters(input.frameWidth).variation < tornPaperEdgeParameters(input.frameWidth).variation);
  assert.ok(tornPaperInnerEdgeParameters(input.frameWidth).step > tornPaperEdgeParameters(input.frameWidth).step);
  const innerFrame = createTornPaperInnerFramePath(input);
  assert.match(innerFrame, /^M0 0H900V600H0ZM/u);
  assert.equal(innerFrame, createTornPaperInnerFramePath(input));
  assert.notEqual(innerFrame, createTornPaperInnerFramePath({ ...input, seed: input.seed + 1 }));
  assert.doesNotMatch(innerFrame, /NaN|Infinity/);
});

test("a collage derives its final hold from the scene duration", () => {
  let story = addScene(createStory({ id: "story", profileId: "profile" }), "scene-1");
  story = addMaterial(story, "scene-1", imageMaterial("wide-1", "landscape"));
  story = configureScene(story, "scene-1", { durationSeconds: 7 });
  story = addMaterial(story, "scene-1", imageMaterial("wide-2", "landscape"));
  assert.equal(story.scenes[0]?.collage?.entryDurationSeconds, 4);
  assert.equal(getCollagePauseDurationSeconds(story.scenes[0]!.collage!, story.scenes[0]!.durationSeconds), 3);
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
  assert.equal(changed.scenes[1]!.rendererId, "collage");
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
    [0, 5, "scene"], [5, 185.266667, "video"], [185.266667, 187.766667, "trim"],
  ]);
  assert.equal(timeline.totalDurationSeconds, 187.766667);
  assert.equal(timeline.totalFrames, 5_633);
  assert.equal(timeline.transitionOverlapSeconds, 0);
  assert.deepEqual(timeline.warnings, []);
  assert.equal(buildStoryTimeline(reorderScenes(story, ["trim", "photo", "video"])).totalDurationSeconds, 187.766667);
  assert.equal(story.scenes[1]!.durationSeconds, 5);
});

test("empty scenes add no footage and keep downstream timestamps exact", () => {
  const story = addScene(timelineStory(), "empty");
  const timeline = buildStoryTimeline(story, [{ formatId: "test", maxDurationSeconds: 6, requiresVerifiedAccount: false }]);
  assert.equal(timeline.totalDurationSeconds, 187.766667);
  assert.equal(timeline.scenes[1]!.startSeconds, 5);
  assert.equal(timeline.scenes[1]!.endSeconds, 185.266667);
  assert.equal(timeline.scenes[2]!.startSeconds, 185.266667);
  assert.equal(timeline.scenes[3]!.startSeconds, 187.766667);
  assert.equal(timeline.scenes[3]!.endSeconds, 187.766667);
  assert.equal(timeline.scenes[3]!.durationSeconds, 0);
  assert.deepEqual(timeline.warnings, [{ code: "empty_scene", sceneId: "empty" }]);
  assert.equal(timeline.formatLimits[0]!.status, "exceeded");
  assert.equal(timeline.formatLimits[0]!.excessSeconds, 181.766667);
});

test("duration warnings are advisory, include exact excess and accept a duration exactly at the limit", () => {
  const story = timelineStory();
  const before = structuredClone(story);
  const limits = [180, 187.766667, 900].map((maxDurationSeconds) => ({ formatId: String(maxDurationSeconds), maxDurationSeconds, requiresVerifiedAccount: false }));
  assert.deepEqual(buildStoryTimeline(story, limits).formatLimits.map(({ status, excessSeconds }) => [status, excessSeconds]), [
    ["exceeded", 7.766667], ["within_limit", 0], ["within_limit", 0],
  ]);
  assert.deepEqual(story, before);
  assert.equal(buildStoryTimeline(createStory({ id: "empty", profileId: "profile" })).totalDurationSeconds, 0);
});

test("story frame rate is exact, bounded and locked by the first video forever", () => {
  for (const [text, expected] of [
    ["24000/1001", { numerator: 24_000, denominator: 1_001 }],
    ["24/1", { numerator: 24, denominator: 1 }],
    ["25/1", { numerator: 25, denominator: 1 }],
    ["30000/1001", { numerator: 30_000, denominator: 1_001 }],
    ["30/1", { numerator: 30, denominator: 1 }],
    ["50/1", { numerator: 50, denominator: 1 }],
    ["60000/1001", { numerator: 60_000, denominator: 1_001 }],
    ["60/1", { numerator: 60, denominator: 1 }],
  ] as const) assert.deepEqual(parseFrameRate(text), expected);
  assert.equal(parseFrameRate("120/1"), undefined);
  assert.deepEqual(normalizeFrameRate({ numerator: 22, denominator: 1 }), { numerator: 30, denominator: 1 });
  assert.deepEqual(normalizeFrameRate({ numerator: 60_000, denominator: 2_002 }), { numerator: 30_000, denominator: 1_001 });

  let story = addScene(createStory({ id: "fps", profileId: "profile" }), "first");
  story = addMaterial(story, "first", {
    ...timelineVideo("first-video", 1), sourceFrameRate: { numerator: 24_000, denominator: 1_001 },
  });
  assert.deepEqual(story.outputFrameRate, { numerator: 24_000, denominator: 1_001 });
  story = removeMaterial(story, "first", "first-video");
  story = addMaterial(story, "first", {
    ...timelineVideo("replacement", 1), sourceFrameRate: { numerator: 60, denominator: 1 },
  });
  assert.deepEqual(story.outputFrameRate, { numerator: 24_000, denominator: 1_001 });

  let fallback = addScene(createStory({ id: "fallback", profileId: "profile" }), "first");
  fallback = addMaterial(fallback, "first", {
    ...timelineVideo("out-of-range", 1), sourceFrameRate: { numerator: 120, denominator: 1 },
  });
  assert.deepEqual(fallback.outputFrameRate, { numerator: 30, denominator: 1 });

  let photosFirst = addScene(createStory({ id: "photos-first", profileId: "profile" }), "photo");
  photosFirst = addMaterial(photosFirst, "photo", imageMaterial("photo", "portrait"));
  assert.equal(photosFirst.outputFrameRate, undefined);
  photosFirst = addScene(photosFirst, "video");
  photosFirst = addMaterial(photosFirst, "video", {
    ...timelineVideo("later-video", 1), sourceFrameRate: { numerator: 25, denominator: 1 },
  });
  assert.deepEqual(photosFirst.outputFrameRate, { numerator: 25, denominator: 1 });

  const manyScenes: Story = {
    ...createStory({ id: "many", profileId: "profile" }),
    outputFrameRate: { numerator: 30_000, denominator: 1_001 },
    scenes: Array.from({ length: 30 }, (_, index) => ({
      id: `scene-${index}`, materials: [imageMaterial(`image-${index}`, "portrait")],
      durationSeconds: 3.37, motion: "none" as const, rendererId: "still-image", render: { status: "idle" as const },
    })),
  };
  const frameTimeline = buildStoryTimeline(manyScenes);
  const framesPerScene = Math.round(3.37 * 30_000 / 1_001);
  assert.equal(frameTimeline.totalFrames, framesPerScene * 30);
  assert.deepEqual(frameTimeline.scenes.map(({ startFrame }) => startFrame),
    Array.from({ length: 30 }, (_, index) => index * framesPerScene));
});

function timelineVideo(id: string, sourceDurationSeconds: number): VideoMaterial {
  return { ...fileMetadata(id, "landscape"), kind: "video", hasAudio: false, audioTags: [], sourceDurationSeconds };
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
