import { defaultCollageSettings } from "@storyteller/domain";
import { describe, expect, it } from "vitest";
import type { ImageMaterial, Scene, VideoMaterial } from "../../api.js";
import { buildScenePlaybackPlan } from "./scene-playback-plan.js";

describe("scene playback plan", () => {
  it("ignores render job status in player identity but changes it for visual inputs", () => {
    const value = scene("collage", [imageMaterial("one"), imageMaterial("two")], "collage");
    const idle = buildScenePlaybackPlan(value);
    const rendering = buildScenePlaybackPlan({ ...value, render: { status: "running" } });
    const relaid = buildScenePlaybackPlan({ ...value, layoutId: "another-layout" });

    expect(rendering.identity).toBe(idle.identity);
    expect(relaid.identity).not.toBe(idle.identity);
  });

  it("holds collage videos at their final frame and loops multi-material layouts", () => {
    const video = videoMaterial("video");
    const photo = imageMaterial("photo");
    const collage = scene("collage", [video, photo], "collage");
    const layout = scene("layout", [video, photo], "layout");

    expect(buildScenePlaybackPlan(collage).slots.map(({ endBehavior }) => endBehavior)).toEqual(["hold", "hold"]);
    expect(buildScenePlaybackPlan(layout).slots.map(({ endBehavior }) => endBehavior)).toEqual(["loop", "loop"]);
  });

  it("defines the previous rendered frame as the collage background for every preview", () => {
    const previous = scene("previous", [videoMaterial("previous-video")], "layout");
    const current = scene("current", [imageMaterial("card"), imageMaterial("card-2")], "collage");
    const background = buildScenePlaybackPlan(current, previous).background;

    expect(background).toMatchObject({ kind: "previous-scene-frame", scene: previous, treated: true });
    expect(background).not.toHaveProperty("slot.material.id", "previous-video");
  });

  it("treats a custom background as a silent hold slot with its own resource identity", () => {
    const background = videoMaterial("background");
    const current = {
      ...scene("current", [imageMaterial("card"), imageMaterial("card-2")], "collage"),
      collageBackground: { source: "material" as const, material: background },
    };
    const plan = buildScenePlaybackPlan(current);

    expect(plan.background).toMatchObject({
      kind: "material", treated: false,
      slot: { material: background, audioEnabled: false, endBehavior: "hold" },
    });
    expect(plan.requiredResourceIds).toContain("collage-background:0:background:visual");
    expect(plan.requiredResourceIds.some((id) => id.endsWith(":audio"))).toBe(false);
  });
});

function scene(id: string, materials: Array<ImageMaterial | VideoMaterial>, rendererId: "collage" | "layout"): Scene {
  return {
    id,
    rendererId: rendererId === "collage" ? "collage" : "video",
    layoutId: rendererId === "collage" ? "stack" : "split",
    materials,
    durationSeconds: 5,
    motion: "none",
    ...(rendererId === "collage" ? { collage: defaultCollageSettings(materials) } : {}),
    render: { status: "idle" },
  };
}

function imageMaterial(id: string): ImageMaterial {
  return {
    id, kind: "image", name: `${id}.jpg`, orientation: "portrait", storageKey: `${id}.jpg`, mimeType: "image/jpeg",
    sizeBytes: 10, width: 1080, height: 1920,
  };
}

function videoMaterial(id: string): VideoMaterial {
  return {
    id, kind: "video", name: `${id}.mp4`, orientation: "portrait", storageKey: `${id}.mp4`, mimeType: "video/mp4",
    sizeBytes: 10, width: 1080, height: 1920, hasAudio: true, audioTags: [], sourceDurationSeconds: 5,
    videoTrack: { storageKey: `${id}-video.mp4`, mimeType: "video/mp4", sizeBytes: 8, durationSeconds: 5 },
    audioTrack: {
      storageKey: `${id}-audio.m4a`, mimeType: "audio/mp4", sizeBytes: 2, durationSeconds: 5,
      sampleRate: 48_000, channels: 2,
      processing: { version: 1, filter: "anull", integratedLufs: -16, truePeakDbfs: -1 },
    },
  };
}
