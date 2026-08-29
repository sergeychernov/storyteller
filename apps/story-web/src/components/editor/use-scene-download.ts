import { analytics, type ExportFailureReason, type ExportFailureStage } from "@storyteller/analytics";
import { useEffect, useRef, useState } from "react";
import {
  ApiError, downloadSceneRender, getSceneRender, requestSceneRender, type AuthSession, type Scene, type VideoExportMode,
} from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneRenderStaleError, SceneRenderTimeoutError, waitForSceneRender } from "./scene-render-polling.js";

interface DownloadFile { readonly url: string; readonly filename: string }

export function useSceneDownload(scene: Scene, storyId: string, session: AuthSession, copy: EditorCopy) {
  const controller = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<"idle" | "rendering" | "error">("idle");
  const [error, setError] = useState<string>();
  const supported = scene.materials.length === 1 && (scene.materials[0]?.kind === "video"
    || scene.rendererId === "still-image" && scene.materials[0]?.kind === "image");
  const sceneVersion = JSON.stringify([storyId, scene]);

  useEffect(() => {
    setState("idle");
    setError(undefined);
    return () => controller.current?.abort();
  }, [sceneVersion, storyId, session.accessToken]);

  async function download(mode: VideoExportMode = "video") {
    if (!supported || controller.current && !controller.current.signal.aborted) return;
    const requestController = new AbortController();
    controller.current = requestController;
    const signal = requestController.signal;
    let failureStage: ExportFailureStage = "request";
    setState("rendering");
    setError(undefined);
    try {
      const initial = await requestSceneRender(session.accessToken, storyId, scene.id, mode, signal);
      analytics.track("scene render requested", { export_mode: mode });
      failureStage = "processing";
      const render = await waitForSceneRender(initial, {
        signal,
        load: (renderId, requestSignal) => getSceneRender(session.accessToken, storyId, scene.id, renderId, requestSignal),
      });
      analytics.track("scene render succeeded", { export_mode: mode });
      failureStage = "download";
      const blob = await downloadSceneRender(session.accessToken, storyId, scene.id, render.id, signal);
      signal.throwIfAborted();
      const prepared = {
        url: URL.createObjectURL(blob),
        filename: `${safeFileName(scene.title) || `scene-${scene.id}`}-${mode}.${mode === "audio" ? "m4a" : "mp4"}`,
      };
      saveFile(prepared);
      analytics.track("scene exported", { export_mode: mode });
      // Allow the browser to start saving before releasing the object URL. Every next
      // download goes through the API again, including edits made in another tab.
      setTimeout(() => URL.revokeObjectURL(prepared.url), 1_000);
      setState("idle");
    } catch (caught) {
      if (signal.aborted) return;
      analytics.track("scene export failed", {
        export_mode: mode,
        failure_stage: failureStage,
        failure_reason: exportFailureReason(caught),
      });
      setError(caught instanceof SceneRenderStaleError || caught instanceof ApiError
        && (caught.code === "scene_render_stale" || caught.code === "story_revision_conflict")
        ? copy.renderVersionChanged : caught instanceof SceneRenderTimeoutError
        ? caught.phase === "queue" ? copy.renderQueueTimeout : copy.renderSceneTimeout
        : caught instanceof Error && caught.message ? caught.message : copy.renderSceneError);
      setState("error");
    } finally {
      if (controller.current === requestController) controller.current = undefined;
    }
  }

  return { supported, state, error, download };
}

function saveFile({ url, filename }: DownloadFile): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
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
