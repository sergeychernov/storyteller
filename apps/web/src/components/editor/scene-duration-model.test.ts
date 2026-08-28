import assert from "node:assert/strict";
import test from "node:test";
import type { ImageMaterial, Scene, VideoMaterial } from "../../api.js";
import { formatSceneDuration, getSceneDurationSeconds } from "./scene-duration-model.js";

const video: VideoMaterial = {
  id: "video", kind: "video", name: "video.mp4", orientation: "portrait", storageKey: "video.mp4",
  mimeType: "video/mp4", sizeBytes: 100, width: 1080, height: 1920,
  hasAudio: false, audioTags: [], sourceDurationSeconds: 30,
};
const image: ImageMaterial = {
  id: "image", kind: "image", name: "image.jpg", orientation: "portrait", storageKey: "image.jpg",
  mimeType: "image/jpeg", sizeBytes: 100, width: 1080, height: 1920,
};

test("single-video duration uses both trim boundaries instead of the configured five seconds", () => {
  const selected = scene([trimmedVideo(4.25, 12.75)]);
  assert.equal(getSceneDurationSeconds(selected), 8.5);
  assert.equal(formatSceneDuration(selected), "8.5");
  assert.equal(selected.durationSeconds, 5);
});

test("video duration follows start-only, end-only, and updated trims", () => {
  assert.equal(getSceneDurationSeconds(scene([trimmedVideo(4, 30)])), 26);
  assert.equal(getSceneDurationSeconds(scene([trimmedVideo(0, 12)])), 12);
  assert.equal(getSceneDurationSeconds(scene([trimmedVideo(3, 12)])), 9);
  assert.equal(getSceneDurationSeconds(scene([trimmedVideo(3, 10)])), 7);
});

test("untrimmed and reset videos use the full source duration without photo duration limits", () => {
  assert.equal(getSceneDurationSeconds(scene([video])), 30);
  assert.equal(getSceneDurationSeconds(scene([trimmedVideo(2, 2.5)])), 0.5);
  assert.equal(getSceneDurationSeconds(scene([trimmedVideo(2, 24)])), 22);
  const { trim: _trim, ...spatialEdit } = trimmedVideo(2, 24).edit!;
  assert.equal(getSceneDurationSeconds(scene([{ ...video, edit: spatialEdit }])), 30);
});

test("untrimmed videos prefer source metadata and fall back to the working video track", () => {
  const track = { storageKey: "track.mp4", mimeType: "video/mp4", sizeBytes: 90, durationSeconds: 29.97 };
  assert.equal(getSceneDurationSeconds(scene([{ ...video, videoTrack: track }])), 30);
  const { sourceDurationSeconds: _duration, ...legacyVideo } = video;
  assert.equal(getSceneDurationSeconds(scene([{ ...legacyVideo, videoTrack: track }])), 29.97);
});

test("videos without duration metadata show an unknown value unless trim supplies the range", () => {
  const { sourceDurationSeconds: _duration, ...legacyVideo } = video;
  assert.equal(getSceneDurationSeconds(scene([legacyVideo])), undefined);
  assert.equal(formatSceneDuration(scene([legacyVideo])), "—");
  assert.equal(getSceneDurationSeconds(scene([{ ...legacyVideo, edit: trimmedVideo(1, 7).edit! }])), 6);
});

test("empty, photo, and multi-material scenes keep their configured duration", () => {
  for (const materials of [[], [image], [image, { ...image, id: "second" }], [trimmedVideo(2, 24), image], [video, { ...video, id: "second" }]]) {
    const selected = { ...scene(materials), durationSeconds: 11 };
    assert.equal(getSceneDurationSeconds(selected), 11);
    assert.equal(formatSceneDuration(selected), "11");
  }
});

test("duration labels match trim precision without floating-point noise or redundant zeroes", () => {
  assert.equal(formatSceneDuration(scene([trimmedVideo(0.1, 0.3)])), "0.2");
  assert.equal(formatSceneDuration(scene([trimmedVideo(1.111, 7.777)])), "6.67");
  assert.equal(formatSceneDuration(scene([trimmedVideo(2, 8.01)])), "6.01");
  assert.equal(formatSceneDuration(scene([trimmedVideo(2, 8)])), "6");
});

function scene(materials: Scene["materials"]): Scene {
  return { id: "scene", materials, durationSeconds: 5, motion: "none", render: { status: "idle" } };
}

function trimmedVideo(startSeconds: number, endSeconds: number): VideoMaterial {
  return { ...video, edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds, endSeconds } } };
}
