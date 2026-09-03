import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  AccessControlService,
  ApplicationError,
  StoryApplication,
  createBaselineAccessState,
  type AccessState,
  type EffectiveAccess,
  type PlatformCredentialSummary,
  type ProductActivityRecord,
  type ProfileAuthentication,
  type SessionRecord,
  type StoryRepository,
} from "@storyteller/application";
import { getMaterialPresentation, materialStorageKeys, type PlatformCredential, type PlatformProvider, type Profile, type ProfileUpdate, type SceneMaterial, type Story } from "@storyteller/domain";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue } from "@storyteller/render-queue";
import { probeMedia, renderVideo, SpawnMediaProcessRunner } from "@storyteller/renderer";
import { Readable } from "node:stream";
import type { LightMyRequestResponse } from "fastify";
import type { OpenAPIV3 } from "openapi-types";
import { sceneRenderFileType, sceneRenderSlot, sceneRenderStorageKey } from "@storyteller/render-queue";
import type { StoryTimelineResponse } from "@storyteller/schemas";
import sharp from "sharp";
import { normalizeStoredStory } from "./database.js";
import { buildApi } from "./server.js";
import { detectMediaMetadata, MediaStorage } from "./media-storage.js";
import { LocalObjectStorage, S3ObjectStorage } from "./object-storage.js";
import { accessPolicyForRoute } from "./access-control.js";
import { buildSceneRenderInput } from "./scene-render-input.js";

test("opens a legacy story without fileless material placeholders", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy story",
    status: "draft",
    revision: 6,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      layoutId: "portrait-cascade-up",
      motion: "none",
      materials: [{ id: "08140c76-10ba-48c5-a000-fa56c9e7364a", kind: "image", name: "1", orientation: "portrait" }],
      render: { status: "ready", artifactId: "obsolete-preview" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.deepEqual(normalized.scenes[0]?.materials, []);
  assert.equal(normalized.scenes[0]?.layoutId, undefined);
  assert.equal(normalized.scenes[0]?.focusPoint, undefined);
  assert.deepEqual(normalized.scenes[0]?.render, { status: "idle" });
});

test("rejects invalid file-backed video metadata instead of silently removing the material", () => {
  assert.throws(() => normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Invalid stored video",
    status: "draft",
    revision: 1,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      motion: "none",
      materials: [{
        id: "08140c76-10ba-48c5-a000-fa56c9e7364a",
        kind: "video",
        name: "clip.mp4",
        orientation: "portrait",
        storageKey: "profile/story/clip.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
        width: 1080,
        height: 1920,
        hasAudio: false,
        audioTags: [],
      }],
      render: { status: "idle" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  }), /sourceDurationSeconds/);
});

test("upgrades a legacy scene with one image to the still-image renderer", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy still",
    status: "draft",
    revision: 3,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 8,
      layoutId: "full-frame",
      motion: "zoom-in",
      materials: [{
        id: "08140c76-10ba-48c5-a000-fa56c9e7364a",
        kind: "image",
        name: "portrait.png",
        orientation: "portrait",
        storageKey: "profile/story/portrait.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        width: 1080,
        height: 1920,
      }],
      render: { status: "idle" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.equal(normalized.scenes[0]?.rendererId, "still-image");
  assert.deepEqual(normalized.scenes[0]?.focusPoint, { x: 0.5, y: 0.5 });
});

test("normalizes legacy string scene titles with defaults and the effective scene duration", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy title",
    status: "draft",
    revision: 3,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      title: "  Старый титр  ",
      durationSeconds: 8,
      motion: "zoom-in",
      materials: [{
        id: "08140c76-10ba-48c5-a000-fa56c9e7364a", kind: "image", name: "portrait.png", orientation: "portrait",
        storageKey: "profile/story/portrait.png", mimeType: "image/png", sizeBytes: 1024, width: 1080, height: 1920,
      }],
      render: { status: "idle" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.deepEqual(normalized.scenes[0]?.title, {
    text: "Старый титр", position: { x: 0.5, y: 0.78 }, style: "shadow", size: "medium", color: "#FFFFFF",
    timing: { startSeconds: 0, endSeconds: 8 },
  });
});

test("hydrates deterministic resting angles and offsets when opening a legacy collage", () => {
  const payload = {
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy collage",
    status: "draft",
    revision: 3,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      layoutId: "stack",
      rendererId: "collage",
      motion: "none",
      materials: [
        legacyImage("08140c76-10ba-48c5-a000-fa56c9e7364a", "first.png"),
        legacyImage("18140c76-10ba-48c5-a000-fa56c9e7364a", "second.png"),
      ],
      collage: {
        frame: { width: 6, color: "#FFFFFF", shape: "straight" },
        entryDurationSeconds: 4,
      },
      render: { status: "idle" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  };
  const normalized = normalizeStoredStory(payload);
  assert.equal(normalized.scenes[0]?.collage?.straightCards, false);
  assert.equal(normalized.scenes[0]?.collage?.rowDirection, "ascending");
  assert.deepEqual(normalized.scenes[0]?.collage?.cardAngles.map(({ materialId }) => materialId),
    payload.scenes[0]!.materials.map(({ id }) => id));
  assert.ok(normalized.scenes[0]!.collage!.cardAngles.every(({ angleDegrees }) => Math.abs(angleDegrees) >= 2
    && Math.abs(angleDegrees) <= 8));
  assert.deepEqual(normalizeStoredStory(payload).scenes[0]?.collage?.cardAngles,
    normalized.scenes[0]?.collage?.cardAngles);
  assert.deepEqual(normalized.scenes[0]?.collage?.cardOffsets,
    payload.scenes[0]!.materials.map(({ id }) => ({ materialId: id, offsetY: 0 })));
  assert.deepEqual(normalizeStoredStory(payload).scenes[0]?.collage?.cardOffsets,
    normalized.scenes[0]?.collage?.cardOffsets);
  assert.equal(normalized.scenes[0]?.collage?.frame.width, 12);
  assert.deepEqual(normalized.scenes[0]?.collageBackground, { source: "previous-scene" });
});

test("migrates the legacy first material background into a separate scene resource", () => {
  const background = legacyImage("08140c76-10ba-48c5-a000-fa56c9e7364a", "background.png", "portrait");
  const cards = [
    legacyImage("18140c76-10ba-48c5-a000-fa56c9e7364a", "left.png"),
    legacyImage("28140c76-10ba-48c5-a000-fa56c9e7364a", "right.png"),
  ];
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy custom background",
    status: "draft",
    revision: 4,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      layoutId: "stack",
      rendererId: "collage",
      motion: "none",
      materials: [background, ...cards],
      collage: {
        background: { mode: "first-material" },
        frame: { width: 12, color: "#FFFFFF", shape: "straight" },
        entryDurationSeconds: 4,
      },
      render: { status: "ready", artifactId: "stale" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  const scene = normalized.scenes[0]!;
  assert.deepEqual(scene.materials.map(({ id }) => id), cards.map(({ id }) => id));
  assert.deepEqual(scene.collageBackground, { source: "material", material: background });
  assert.equal("background" in scene.collage!, false);
  assert.deepEqual(scene.collage!.cardAngles.map(({ materialId }) => materialId), cards.map(({ id }) => id));
  assert.deepEqual(scene.render, { status: "idle" });
});

test("repairs a stale generic layout when mixed media now has one exact collage layout", () => {
  const materialIds = [
    "08140c76-10ba-48c5-a000-fa56c9e7364a",
    "18140c76-10ba-48c5-a000-fa56c9e7364a",
    "28140c76-10ba-48c5-a000-fa56c9e7364a",
  ];
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Mixed legacy collage",
    status: "draft",
    revision: 4,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      layoutId: "overlap-stack",
      rendererId: "collage",
      motion: "none",
      materials: [
        legacyImage(materialIds[0]!, "portrait.png", "portrait"),
        {
          ...legacyImage(materialIds[1]!, "portrait.mp4", "portrait"),
          kind: "video", mimeType: "video/mp4", hasAudio: false, audioTags: [], sourceDurationSeconds: 5,
        },
        legacyImage(materialIds[2]!, "landscape.png"),
      ],
      collage: {
        frame: { width: 6, color: "#FFFFFF", shape: "straight" },
        entryDurationSeconds: 4,
        straightCards: false,
        cardAngles: [],
      },
      render: { status: "ready", artifactId: "stale-render" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  const scene = normalized.scenes[0]!;
  assert.equal(scene.layoutId, "2+1");
  assert.deepEqual(scene.collage?.cardAngles.map(({ materialId }) => materialId), materialIds);
  assert.deepEqual(scene.collage?.cardOffsets.map(({ materialId }) => materialId), materialIds);
  const offsetDifference = scene.collage!.cardOffsets[1]!.offsetY - scene.collage!.cardOffsets[0]!.offsetY;
  assert.ok(offsetDifference <= -20 && offsetDifference >= -40);
  assert.deepEqual(scene.render, { status: "idle" });
});

function legacyImage(id: string, name: string, orientation: "portrait" | "landscape" = "landscape") {
  return {
    id, kind: "image", name, orientation, storageKey: name, mimeType: "image/png",
    sizeBytes: 1024, width: orientation === "portrait" ? 900 : 1600, height: orientation === "portrait" ? 1600 : 900,
  };
}
