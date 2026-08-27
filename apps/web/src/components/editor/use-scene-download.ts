import { useEffect, useRef, useState } from "react";
import {
  downloadSceneRender, getSceneRender, requestSceneRender, type AuthSession, type Scene, type VideoExportMode,
} from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneRenderTimeoutError, waitForSceneRender } from "./scene-render-polling.js";

interface DownloadFile { readonly url: string; readonly filename: string; readonly sceneVersion: string; readonly mode: VideoExportMode }

export function useSceneDownload(scene: Scene, storyId: string, session: AuthSession, copy: EditorCopy) {
  const controller = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<"idle" | "rendering" | "error">("idle");
  const [error, setError] = useState<string>();
  const [file, setFile] = useState<DownloadFile>();
  const supported = scene.materials.length === 1 && (scene.materials[0]?.kind === "video"
    || scene.rendererId === "still-image" && scene.materials[0]?.kind === "image");
  const sceneVersion = JSON.stringify([storyId, scene]);

  useEffect(() => {
    setState("idle");
    setError(undefined);
    setFile(undefined);
    return () => controller.current?.abort();
  }, [sceneVersion, storyId, session.accessToken]);

  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);

  async function download(mode: VideoExportMode = "video") {
    if (!supported || controller.current && !controller.current.signal.aborted) return;
    if (file?.sceneVersion === sceneVersion && file.mode === mode) { saveFile(file); return; }
    const requestController = new AbortController();
    controller.current = requestController;
    const signal = requestController.signal;
    setState("rendering");
    setError(undefined);
    try {
      const initial = await requestSceneRender(session.accessToken, storyId, scene.id, mode, signal);
      const render = await waitForSceneRender(initial, {
        signal,
        load: (renderId, requestSignal) => getSceneRender(session.accessToken, storyId, scene.id, renderId, requestSignal),
      });
      const blob = await downloadSceneRender(session.accessToken, storyId, scene.id, render.id, signal);
      signal.throwIfAborted();
      const prepared = {
        url: URL.createObjectURL(blob),
        filename: `${safeFileName(scene.title) || `scene-${scene.id}`}-${mode}.${mode === "audio" ? "m4a" : "mp4"}`,
        sceneVersion, mode,
      };
      setFile(prepared);
      saveFile(prepared);
      setState("idle");
    } catch (caught) {
      if (signal.aborted) return;
      setError(caught instanceof SceneRenderTimeoutError
        ? caught.phase === "queue" ? copy.renderQueueTimeout : copy.renderSceneTimeout
        : caught instanceof Error && caught.message ? caught.message : copy.renderSceneError);
      setState("error");
    } finally {
      if (controller.current === requestController) controller.current = undefined;
    }
  }

  // Keep a real download link available if the browser blocks the asynchronous automatic save.
  return { supported, state, error, download, file: file?.sceneVersion === sceneVersion ? file : undefined };
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
