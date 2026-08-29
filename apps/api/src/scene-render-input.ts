import { ApplicationError } from "@storyteller/application";
import { centeredFocusPoint, getMaterialPresentation, getMaterialSource, type Scene, type VideoExportMode } from "@storyteller/domain";
import type { RenderDependency, SceneRenderInput } from "@storyteller/render-queue";
import { lastFrameRendererVersion, sceneFramePngCompressionLevel, stillImageRendererVersion, videoRendererVersion } from "@storyteller/renderer";
import type { MediaStorage } from "./media-storage.js";

export async function buildSceneRenderInput(scene: Scene, media: Pick<MediaStorage, "contentHash">, mode?: VideoExportMode): Promise<SceneRenderInput> {
  const material = scene.materials[0];
  if (scene.materials.length !== 1 || !material || (material.kind === "image" && scene.rendererId !== "still-image")) {
    throw new ApplicationError("scene rendering is available only for one image or video", 422, "unsupported_scene_renderer");
  }
  if (mode === "audio" && (material.kind !== "video" || !material.hasAudio)) {
    throw new ApplicationError("this scene has no audio track", 422, "missing_audio_track");
  }
  const dependencies: RenderDependency[] = [];
  async function dependency(role: RenderDependency["role"], file: { storageKey: string; contentHash?: string }, parameters = {}) {
    const contentHash = await media.contentHash(file);
    dependencies.push({ role, storageKey: file.storageKey, contentHash, parameters, parents: role === "original" ? [] : ["original"] });
    return contentHash;
  }
  const originalHash = await dependency("original", material);
  const presentation = getMaterialPresentation(material);
  const source = material.kind === "video" ? getMaterialSource(material) : presentation;
  const exportMode = mode ?? "combined";
  let sourceHash = originalHash;
  let audioHash: string | undefined;
  if (material.kind === "image" && material.edit?.result) {
    sourceHash = await dependency("image-edit", material.edit.result, { rotation: material.edit.rotation, crop: material.edit.crop });
  } else if (material.kind === "video") {
    if (material.videoTrack && (exportMode !== "audio" || !material.audioTrack)) {
      sourceHash = await dependency("video-track", material.videoTrack, { operation: "demux-video", version: 1 });
    }
    if (material.audioTrack && exportMode !== "video") {
      audioHash = await dependency("audio-track", material.audioTrack, material.audioTrack.processing);
    }
  }
  const common = {
    dependencies,
    material: {
      storageKey: source.storageKey, name: source.storageKey, mimeType: source.mimeType,
      width: source.width, height: source.height, orientation: source.orientation,
      // An audio-only export with a separate track never reads the video file.
      ...(material.kind === "video" && exportMode === "audio" && material.audioTrack ? {} : { contentHash: sourceHash }),
    },
    durationSeconds: scene.durationSeconds, motion: scene.motion, focusPoint: scene.focusPoint ?? centeredFocusPoint,
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" as const },
  };
  if (material.kind === "image") return { ...common, rendererId: "still-image", rendererVersion: stillImageRendererVersion };
  const sourceDurationSeconds = material.sourceDurationSeconds ?? material.videoTrack?.durationSeconds;
  return {
    ...common, rendererId: "video", rendererVersion: videoRendererVersion, mode: exportMode, hasAudio: material.hasAudio,
    edit: { rotation: material.edit?.rotation ?? 0, crop: material.edit?.crop ?? { x: 0, y: 0, width: 1, height: 1 },
      ...(material.edit?.trim ? { trim: material.edit.trim } : {}) },
    ...(sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds }),
    ...(material.audioTrack && audioHash ? { audio: {
      storageKey: material.audioTrack.storageKey, name: material.audioTrack.storageKey,
      mimeType: material.audioTrack.mimeType, contentHash: audioHash,
    } } : {}),
    durationSeconds: presentation.durationSeconds ?? sourceDurationSeconds ?? scene.durationSeconds,
    output: { ...common.output, width: presentation.width, height: presentation.height },
  };
}

export async function buildSceneFrameInput(scene: Scene, media: Pick<MediaStorage, "contentHash">): Promise<SceneRenderInput> {
  const input = await buildSceneRenderInput(scene, media, scene.materials[0]?.kind === "video" ? "video" : undefined);
  return {
    ...input,
    artifact: "scene-frame",
    frame: {
      rendererVersion: lastFrameRendererVersion,
      format: "png",
      compressionLevel: sceneFramePngCompressionLevel,
      intermediateCodec: "h264-lossless",
      // Titles, captions and future overlays deliberately stay outside this recipe.
      layerPolicy: "base-visual",
    },
  };
}
