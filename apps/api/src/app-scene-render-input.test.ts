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
import { hashSceneRenderInput, sceneRenderParameters, type ObjectDeletionJob, type SceneRenderJob, type SceneRenderQueue } from "@storyteller/render-queue";
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
import { buildSceneFrameInput, buildSceneRenderInput } from "./scene-render-input.js";

test("visual render inputs version and hash titles without exposing raw text, while scene frames omit them", async () => {
  const scene = {
    id: "scene", rendererId: "still-image", durationSeconds: 5, motion: "none" as const,
    focusPoint: { x: 0.5, y: 0.5 },
    title: {
      text: "Секретный текст", position: { x: 0.4, y: 0.7 }, style: "plate" as const, size: "large" as const,
      color: "#FFE082" as const, timing: { startSeconds: 0.5, endSeconds: 4.5 },
    },
    materials: [{
      id: "image", kind: "image" as const, name: "image.jpg", storageKey: "image.jpg", mimeType: "image/jpeg",
      sizeBytes: 100, width: 900, height: 1600, orientation: "portrait" as const,
    }],
    render: { status: "idle" as const },
  };
  const media = { async contentHash({ storageKey }: { storageKey: string }) { return createHash("sha256").update(storageKey).digest("hex"); } };
  const visual = await buildSceneRenderInput(scene, media);
  assert.equal(visual.title?.rendererVersion, "scene-title.v2");
  assert.equal(JSON.stringify(sceneRenderParameters(visual)).includes(scene.title.text), false);
  assert.equal(JSON.stringify(sceneRenderParameters(visual)).includes(createHash("sha256").update(scene.title.text).digest("hex")), true);
  const changed = { ...visual, title: { ...visual.title!, style: "shadow" as const } };
  assert.notEqual(hashSceneRenderInput(visual), hashSceneRenderInput(changed));

  const frame = await buildSceneFrameInput(scene, media);
  assert.equal(frame.title, undefined);
  assert.equal(JSON.stringify(sceneRenderParameters(frame)).includes(scene.title.text), false);

  const videoScene = {
    ...scene,
    rendererId: "video",
    materials: [{
      id: "video", kind: "video" as const, name: "video.mp4", storageKey: "video.mp4", mimeType: "video/mp4",
      sizeBytes: 100, width: 900, height: 1600, orientation: "portrait" as const, hasAudio: true,
      audioTags: [], sourceDurationSeconds: 5,
    }],
  };
  const combined = await buildSceneRenderInput(videoScene, media, "combined");
  const audio = await buildSceneRenderInput(videoScene, media, "audio");
  const { title: _ignoredTitle, ...videoWithoutTitle } = videoScene;
  const audioWithoutTitle = await buildSceneRenderInput(videoWithoutTitle, media, "audio");
  assert.ok(combined.title);
  assert.equal(audio.title, undefined);
  assert.equal(hashSceneRenderInput(audio), hashSceneRenderInput(audioWithoutTitle));
});

test("builds a crop-aware mixed PPL render job with a silent video card", async () => {
  const scene = {
    id: "scene", rendererId: "collage", layoutId: "2+1", durationSeconds: 5, motion: "none" as const,
    materials: [
      {
        id: "video", kind: "video" as const, name: "video.mp4", storageKey: "original/video.mp4", mimeType: "video/mp4",
        sizeBytes: 1_000, width: 900, height: 1600, orientation: "portrait" as const, hasAudio: true, audioTags: ["ambient" as const],
        sourceDurationSeconds: 8,
        videoTrack: { storageKey: "tracks/video.mp4", mimeType: "video/mp4", sizeBytes: 900, durationSeconds: 8 },
        edit: { rotation: 0 as const, crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, trim: { startSeconds: 1, endSeconds: 4 } },
      },
      { id: "portrait", kind: "image" as const, name: "portrait.jpg", storageKey: "portrait.jpg", mimeType: "image/jpeg",
        sizeBytes: 100, width: 900, height: 1600, orientation: "portrait" as const },
      { id: "landscape", kind: "image" as const, name: "landscape.jpg", storageKey: "landscape.jpg", mimeType: "image/jpeg",
        sizeBytes: 100, width: 1600, height: 900, orientation: "landscape" as const },
    ],
    collage: {
      frame: { width: 12 as const, color: "#FFFFFF", shape: "straight" as const }, entryDurationSeconds: 4,
      rowDirection: "ascending" as const,
      straightCards: false,
      cardAngles: [
        { materialId: "video", angleDegrees: -4 }, { materialId: "portrait", angleDegrees: 4 },
        { materialId: "landscape", angleDegrees: -3 },
      ],
      cardOffsets: [
        { materialId: "video", offsetY: 15 }, { materialId: "portrait", offsetY: -15 },
        { materialId: "landscape", offsetY: 0 },
      ],
    },
    render: { status: "idle" as const },
  };
  const input = await buildSceneRenderInput(scene, {
    async contentHash({ storageKey }) { return createHash("sha256").update(storageKey).digest("hex"); },
  }, "video");
  assert.equal(input.rendererId, "collage");
  if (input.rendererId !== "collage") throw new Error("expected collage input");
  assert.equal(input.rendererVersion, 24);
  assert.equal(input.layoutOverlapRatio, 0.4);
  assert.equal(input.background?.source, "card-fallback");
  if (input.background?.source !== "card-fallback") throw new Error("expected card fallback background");
  assert.equal(input.background.materialId, "video");
  assert.equal(input.background.treatment, "darkened");
  assert.deepEqual(input.materials[0], {
    id: "video", kind: "video", storageKey: "tracks/video.mp4", name: "tracks/video.mp4", mimeType: "video/mp4",
    width: 452, height: 1600, orientation: "portrait", sourceWidth: 900, sourceHeight: 1600, sourceDurationSeconds: 8,
    edit: { rotation: 0, crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, trim: { startSeconds: 1, endSeconds: 4 } },
    contentHash: createHash("sha256").update("tracks/video.mp4").digest("hex"),
  });
  assert.deepEqual(input.background.material, input.materials[0]);
  assert.deepEqual(input.dependencies?.map(({ role }) => role), ["original", "video-track", "original", "original"]);
});

test("builds a mixed image/video render job for a non-PPL layout", async () => {
  const scene = {
    id: "scene", rendererId: "collage", layoutId: "stack", durationSeconds: 4, motion: "none" as const,
    materials: [
      {
        id: "video", kind: "video" as const, name: "video.mp4", storageKey: "video.mp4", mimeType: "video/mp4",
        sizeBytes: 1_000, width: 1600, height: 900, orientation: "landscape" as const, hasAudio: false, audioTags: [],
        sourceDurationSeconds: 6,
      },
      {
        id: "image", kind: "image" as const, name: "image.jpg", storageKey: "image.jpg", mimeType: "image/jpeg",
        sizeBytes: 100, width: 1600, height: 900, orientation: "landscape" as const,
      },
    ],
    collage: {
      frame: { width: 12 as const, color: "#FFFFFF", shape: "torn" as const }, entryDurationSeconds: 3,
      rowDirection: "ascending" as const,
      straightCards: false,
      cardAngles: [{ materialId: "video", angleDegrees: -4 }, { materialId: "image", angleDegrees: 4 }],
      cardOffsets: [{ materialId: "video", offsetY: 0 }, { materialId: "image", offsetY: 0 }],
    },
    render: { status: "idle" as const },
  };
  const input = await buildSceneRenderInput(scene, {
    async contentHash({ storageKey }) { return createHash("sha256").update(storageKey).digest("hex"); },
  }, "video");
  assert.equal(input.rendererId, "collage");
  if (input.rendererId !== "collage") throw new Error("expected collage input");
  assert.equal(input.rendererVersion, 24);
  assert.equal(input.layoutId, "stack");
  assert.equal(input.layoutOverlapRatio, 0.4);
  assert.deepEqual(input.materials.map(({ kind }) => kind), ["video", "image"]);
});

test("builds a moving custom background that is absent from collage cards", async () => {
  const background = {
    id: "background", kind: "video" as const, name: "background.mp4", storageKey: "background.mp4", mimeType: "video/mp4",
    sizeBytes: 1_000, width: 900, height: 1600, orientation: "portrait" as const, hasAudio: true, audioTags: ["ambient" as const],
    sourceDurationSeconds: 8,
    edit: { rotation: 0 as const, crop: { x: 0, y: 0.1, width: 1, height: 0.8 }, trim: { startSeconds: 1, endSeconds: 5 } },
  };
  const cards = [
    { id: "left", kind: "image" as const, name: "left.jpg", storageKey: "left.jpg", mimeType: "image/jpeg",
      sizeBytes: 100, width: 1600, height: 900, orientation: "landscape" as const },
    { id: "right", kind: "image" as const, name: "right.jpg", storageKey: "right.jpg", mimeType: "image/jpeg",
      sizeBytes: 100, width: 1600, height: 900, orientation: "landscape" as const },
  ];
  const input = await buildSceneRenderInput({
    id: "scene", rendererId: "collage", layoutId: "stack", durationSeconds: 5, motion: "none",
    materials: cards,
    collageBackground: { source: "material", material: background },
    collage: {
      frame: { width: 12, color: "#FFFFFF", shape: "straight" },
      entryDurationSeconds: 4, rowDirection: "ascending", straightCards: false,
      cardAngles: [{ materialId: "left", angleDegrees: -4 }, { materialId: "right", angleDegrees: 4 }],
      cardOffsets: [{ materialId: "left", offsetY: 0 }, { materialId: "right", offsetY: 0 }],
    },
    render: { status: "idle" },
  }, {
    async contentHash({ storageKey }) { return createHash("sha256").update(storageKey).digest("hex"); },
  }, "video", {
    sceneId: "previous", inputHash: "a".repeat(64), storageKey: "previous.png", contentHash: "b".repeat(64),
  });

  assert.equal(input.rendererId, "collage");
  if (input.rendererId !== "collage") throw new Error("expected collage input");
  assert.equal(input.rendererVersion, 24);
  assert.deepEqual(input.materials.map(({ id }) => id), ["left", "right"]);
  assert.equal(input.background?.source, "custom-material");
  if (input.background?.source !== "custom-material") throw new Error("expected custom material background");
  assert.equal(input.background.treatment, "original");
  assert.equal(input.background.material?.kind, "video");
  assert.equal(input.background.material?.id, "background");
  assert.equal(input.background.material?.edit?.trim?.startSeconds, 1);
  assert.equal(input.dependencies?.some(({ role }) => role === "scene-frame"), false,
    "an explicit material background must not depend on the previous scene frame");
});
