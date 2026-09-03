import { ApplicationError } from "@storyteller/application";
import {
  centeredFocusPoint, collageCardMaterials, collageRendererId, getMaterialPresentation, getSelectedCollageLayout,
  framesToSeconds, frameRateValue, getMaterialSource, resolveCollageSettings, sceneTitleRendererVersion,
  type RationalFrameRate, type Scene, type TimelineScene, type VideoExportMode,
} from "@storyteller/domain";
import {
  sceneFrameDependency,
  type CollageRenderInput, type RenderDependency, type SceneRenderInput, type SceneRenderJob,
} from "@storyteller/render-queue";
import {
  collageRendererVersion, lastFrameRendererVersion, sceneFramePngCompressionLevel, stillImageRendererVersion,
  verticalSocialOutputProfile, videoRendererVersion,
} from "@storyteller/renderer";
import type { MediaStorage } from "./media-storage.js";

export type CollageBackgroundFrame = Pick<
  SceneRenderJob,
  "sceneId" | "inputHash" | "storageKey" | "contentHash"
>;

export async function buildSceneRenderInput(
  scene: Scene,
  media: Pick<MediaStorage, "contentHash">,
  mode?: VideoExportMode,
  backgroundFrame?: CollageBackgroundFrame,
): Promise<SceneRenderInput> {
  const dependencies: RenderDependency[] = [];
  async function dependency(role: RenderDependency["role"], file: { storageKey: string; contentHash?: string }, parameters = {}) {
    const contentHash = await media.contentHash(file);
    dependencies.push({ role, storageKey: file.storageKey, contentHash, parameters, parents: role === "original" ? [] : ["original"] });
    return contentHash;
  }
  if (scene.rendererId === collageRendererId) {
    if (mode && mode !== "video") throw new ApplicationError("an animated collage has no audio track", 422, "missing_audio_track");
    const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
    const cardMaterials = collageCardMaterials(scene.materials, settings);
    const layout = getSelectedCollageLayout(cardMaterials, scene.layoutId);
    if (!layout) throw new ApplicationError(
      "the selected animated collage layout rejected the material formats or orientation sequence",
      422,
      "unsupported_scene_renderer",
    );
    async function renderMaterial(
      material: Scene["materials"][number], index: number, role: "card" | "background" = "card",
    ): Promise<CollageRenderInput["materials"][number]> {
      const originalHash = await dependency("original", material, { materialId: material.id, index, role });
      const presentation = getMaterialPresentation(material);
      if (material.kind === "video") {
        const source = getMaterialSource(material);
        const contentHash = material.videoTrack
          ? await dependency("video-track", material.videoTrack, { materialId: material.id, index, role, operation: "demux-video", version: 1 })
          : originalHash;
        return {
          id: material.id, kind: material.kind, storageKey: source.storageKey, name: source.storageKey, mimeType: source.mimeType,
          width: presentation.width, height: presentation.height, orientation: presentation.orientation, contentHash,
          sourceWidth: material.width, sourceHeight: material.height, sourceDurationSeconds: material.sourceDurationSeconds,
          edit: material.edit ?? { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
        };
      }
      const contentHash = material.edit?.result
        ? await dependency("image-edit", material.edit.result, {
            materialId: material.id, index, role, rotation: material.edit.rotation, crop: material.edit.crop,
          })
        : originalHash;
      return {
        id: material.id, kind: material.kind, storageKey: presentation.storageKey, name: presentation.storageKey, mimeType: presentation.mimeType,
        width: presentation.width, height: presentation.height, orientation: presentation.orientation, contentHash,
      };
    }
    const materials: CollageRenderInput["materials"][number][] = [];
    for (const [index, material] of cardMaterials.entries()) materials.push(await renderMaterial(material, index));
    const customBackground = scene.collageBackground?.source === "material"
      ? await renderMaterial(scene.collageBackground.material, -1, "background")
      : undefined;
    const firstMaterial = materials[0]!;
    const background: CollageRenderInput["background"] = customBackground ? {
      source: "custom-material",
      materialId: customBackground.id,
      treatment: "original",
      material: customBackground,
    } : backgroundFrame ? {
      source: "previous-scene-frame",
      treatment: "darkened",
      sceneId: backgroundFrame.sceneId,
      inputHash: backgroundFrame.inputHash,
      storageKey: backgroundFrame.storageKey!,
      contentHash: backgroundFrame.contentHash!,
      name: "previous-scene-frame.png",
      mimeType: "image/png",
      width: 1080,
      height: 1920,
      orientation: "portrait",
    } : {
      source: "card-fallback",
      materialId: firstMaterial.id,
      treatment: "darkened",
      material: firstMaterial,
    };
    if (backgroundFrame && !customBackground) dependencies.push(sceneFrameDependency(backgroundFrame));
    return {
      dependencies,
      rendererId: "collage",
      rendererVersion: collageRendererVersion,
      layoutId: layout.id,
      layoutRendererId: layout.renderer.id,
      layoutOverlapRatio: layout.overlapRatio,
      settings,
      background,
      materials,
      durationSeconds: scene.durationSeconds,
      ...(scene.title ? { title: { ...scene.title, rendererVersion: sceneTitleRendererVersion } } : {}),
      output: { width: 1080, height: 1920, fps: 30, codec: "h264" },
    };
  }
  const material = scene.materials[0];
  if (scene.materials.length !== 1 || !material || (material.kind === "image" && scene.rendererId !== "still-image")) {
    throw new ApplicationError("scene rendering is available only for one image, one video, or a supported collage of 2 to 6 media cards", 422, "unsupported_scene_renderer");
  }
  if (mode === "audio" && (material.kind !== "video" || !material.hasAudio)) {
    throw new ApplicationError("this scene has no audio track", 422, "missing_audio_track");
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
    ...(scene.title && exportMode !== "audio" ? { title: { ...scene.title, rendererVersion: sceneTitleRendererVersion } } : {}),
    output: { width: 1080, height: 1920, fps: 30, codec: "h264" as const },
  };
  if (material.kind === "image") return { ...common, rendererId: "still-image", rendererVersion: stillImageRendererVersion };
  return {
    ...common, rendererId: "video", rendererVersion: videoRendererVersion, mode: exportMode, hasAudio: material.hasAudio,
    edit: { rotation: material.edit?.rotation ?? 0, crop: material.edit?.crop ?? { x: 0, y: 0, width: 1, height: 1 },
      ...(material.edit?.trim ? { trim: material.edit.trim } : {}) },
    sourceDurationSeconds: material.sourceDurationSeconds,
    ...(material.audioTrack && audioHash ? { audio: {
      storageKey: material.audioTrack.storageKey, name: material.audioTrack.storageKey,
      mimeType: material.audioTrack.mimeType, contentHash: audioHash,
    } } : {}),
    durationSeconds: presentation.durationSeconds ?? material.sourceDurationSeconds,
    output: { ...common.output, width: presentation.width, height: presentation.height },
  };
}

export async function buildSceneFrameInput(
  scene: Scene,
  media: Pick<MediaStorage, "contentHash">,
  backgroundFrame?: CollageBackgroundFrame,
): Promise<SceneRenderInput> {
  const input = await buildSceneRenderInput(
    scene,
    media,
    scene.materials[0]?.kind === "video" ? "video" : undefined,
    backgroundFrame,
  );
  const { title: _title, ...baseVisualInput } = input;
  return {
    ...baseVisualInput,
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

export async function buildStoryExportSegmentInput(
  scene: Scene,
  timelineScene: TimelineScene,
  frameRate: RationalFrameRate,
  media: Pick<MediaStorage, "contentHash">,
  backgroundFrame?: CollageBackgroundFrame,
): Promise<SceneRenderInput> {
  const input = await buildSceneRenderInput(
    scene,
    media,
    scene.materials[0]?.kind === "video" ? "video" : undefined,
    backgroundFrame,
  );
  return {
    ...input,
    artifact: "story-export-segment",
    durationSeconds: framesToSeconds(timelineScene.durationFrames, frameRate),
    output: {
      width: verticalSocialOutputProfile.width,
      height: verticalSocialOutputProfile.height,
      fps: frameRateValue(frameRate),
      codec: verticalSocialOutputProfile.videoCodec,
      profileId: verticalSocialOutputProfile.id,
      frameRate,
      durationFrames: timelineScene.durationFrames,
    },
  };
}
