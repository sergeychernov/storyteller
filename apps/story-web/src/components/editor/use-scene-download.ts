import { analytics, type ExportFailureReason, type ExportFailureStage } from "@storyteller/analytics";
import { useEffect, useRef, useState } from "react";
import {
  ApiError, downloadSceneRender, getSceneRender, requestSceneRender, type AuthSession, type Scene, type SceneRender, type VideoExportMode,
} from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneRenderStaleError, SceneRenderTimeoutError, waitForSceneRender } from "./scene-render-polling.js";
import { isRenderableCollageScene } from "./scene-renderer-model.js";

export interface DownloadFile { readonly url: string; readonly filename: string }

export type PreparedDownloads = Partial<Record<VideoExportMode, DownloadFile>>;

export function useSceneDownload(scene: Scene, storyId: string, session: AuthSession, copy: EditorCopy) {
  const controller = useRef<AbortController | undefined>(undefined);
  const preparedDownloadsRef = useRef<PreparedDownloads>({});
  const [preparedDownloads, setPreparedDownloads] = useState<PreparedDownloads>({});
  const [state, setState] = useState<"idle" | "rendering" | "error">("idle");
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<SceneRender>();
  const supported = scene.materials.length === 1 && (scene.materials[0]?.kind === "video"
    || scene.rendererId === "still-image" && scene.materials[0]?.kind === "image") || isRenderableCollageScene(scene);
  const sceneSnapshotKey = JSON.stringify([storyId, scene]);
  const rendererKind = isRenderableCollageScene(scene) ? "collage" as const
    : scene.materials[0]?.kind === "video" ? "video" as const : "still_image" as const;
  const collageCardOrientation = rendererKind === "collage"
    ? scene.collage?.straightCards ? "straight" as const : "angled" as const
    : "not_applicable" as const;
  const collageMediaMix = rendererKind === "collage"
    ? scene.materials.some(({ kind }) => kind === "video") ? "includes_video" as const : "images_only" as const
    : "not_applicable" as const;

  useEffect(() => {
    setState("idle");
    setError(undefined);
    setProgress(undefined);
    clearPreparedDownloads(preparedDownloadsRef.current);
    preparedDownloadsRef.current = {};
    setPreparedDownloads({});
    return () => {
      controller.current?.abort();
      clearPreparedDownloads(preparedDownloadsRef.current);
    };
  }, [sceneSnapshotKey, storyId, session.csrfToken]);

  async function download(mode: VideoExportMode = "video") {
    if (preparedDownloadsRef.current[mode]) return;
    if (!supported || controller.current && !controller.current.signal.aborted) return;
    const requestController = new AbortController();
    controller.current = requestController;
    const signal = requestController.signal;
    let failureStage: ExportFailureStage = "request";
    setState("rendering");
    setError(undefined);
    try {
      const initial = await requestSceneRender(session.csrfToken, storyId, scene.id, mode, signal);
      analytics.track("scene render requested", {
        export_mode: mode, renderer_kind: rendererKind, collage_card_orientation: collageCardOrientation, collage_media_mix: collageMediaMix,
      });
      failureStage = "processing";
      const render = await waitForSceneRender(initial, {
        signal,
        load: (renderId, requestSignal) => getSceneRender(session.csrfToken, storyId, scene.id, renderId, requestSignal),
        onUpdate: setProgress,
      });
      analytics.track("scene render succeeded", {
        export_mode: mode, renderer_kind: rendererKind, collage_card_orientation: collageCardOrientation, collage_media_mix: collageMediaMix,
      });
      failureStage = "download";
      const blob = await downloadSceneRender(session.csrfToken, storyId, scene.id, render.id, signal);
      signal.throwIfAborted();
      const prepared = {
        url: URL.createObjectURL(blob),
        filename: `${safeFileName(scene.title) || `scene-${scene.id}`}-${mode}.${mode === "audio" ? "m4a" : "mp4"}`,
      };
      preparedDownloadsRef.current = { ...preparedDownloadsRef.current, [mode]: prepared };
      setPreparedDownloads(preparedDownloadsRef.current);
      setState("idle");
    } catch (caught) {
      if (signal.aborted) return;
      analytics.track("scene export failed", {
        export_mode: mode,
        renderer_kind: rendererKind,
        collage_card_orientation: collageCardOrientation,
        collage_media_mix: collageMediaMix,
        failure_stage: failureStage,
        failure_reason: exportFailureReason(caught),
      });
      setError(caught instanceof SceneRenderStaleError || caught instanceof ApiError
        && (caught.code === "scene_render_stale" || caught.code === "story_revision_conflict")
        ? copy.renderChanged : caught instanceof SceneRenderTimeoutError
        ? caught.phase === "queue" ? copy.renderQueueTimeout : copy.renderSceneTimeout
        : caught instanceof Error && caught.message ? caught.message : copy.renderSceneError);
      setState("error");
    } finally {
      if (controller.current === requestController) controller.current = undefined;
    }
  }

  function markDownloaded(mode: VideoExportMode): void {
    analytics.track("scene exported", {
      export_mode: mode, renderer_kind: rendererKind, collage_card_orientation: collageCardOrientation, collage_media_mix: collageMediaMix,
    });
  }

  return { supported, state, error, progress, preparedDownloads, download, markDownloaded };
}

function clearPreparedDownloads(downloads: PreparedDownloads): void {
  for (const download of Object.values(downloads)) {
    if (download) URL.revokeObjectURL(download.url);
  }
}

function safeFileName(value: string | undefined): string {
  return value?.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 100) ?? "";
}

function exportFailureReason(error: unknown): ExportFailureReason {
  if (error instanceof SceneRenderStaleError || error instanceof ApiError
    && (error.code === "scene_render_stale" || error.code === "story_revision_conflict")) return "version_changed";
  if (error instanceof SceneRenderTimeoutError) return error.phase === "queue" ? "queue_timeout" : "render_timeout";
  if (error instanceof ApiError) return "api_error";
  return "unknown";
}
