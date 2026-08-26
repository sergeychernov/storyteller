import { useEffect, useRef, useState } from "react";
import {
  downloadSceneRender, getSceneRender, requestSceneRender, type AuthSession, type Scene, type SceneRender,
} from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneDownloadButton.module.css";

interface SceneDownloadButtonProps {
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly copy: EditorCopy;
}

export function SceneDownloadButton({ scene, storyId, session, copy }: SceneDownloadButtonProps) {
  const controller = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<"idle" | "rendering" | "error">("idle");
  const [error, setError] = useState<string>();
  const supported = scene.rendererId === "still-image" && scene.materials.length === 1 && scene.materials[0]?.kind === "image";

  useEffect(() => () => controller.current?.abort(), []);

  async function handleDownload() {
    if (!supported || state === "rendering") return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setState("rendering");
    setError(undefined);
    try {
      let render = await requestSceneRender(session.accessToken, storyId, scene.id, requestController.signal);
      while (render.status === "queued" || render.status === "running") {
        await wait(800, requestController.signal);
        render = await getSceneRender(session.accessToken, storyId, scene.id, render.id, requestController.signal);
      }
      assertReady(render);
      const blob = await downloadSceneRender(session.accessToken, storyId, scene.id, render.id, requestController.signal);
      saveBlob(blob, `${safeFileName(scene.title) || `scene-${scene.id}`}.mp4`);
      setState("idle");
    } catch (caught) {
      if (requestController.signal.aborted) return;
      setError(caught instanceof Error && caught.message ? caught.message : copy.renderSceneError);
      setState("error");
    }
  }

  const label = state === "rendering" ? copy.renderingScene : state === "error" ? error ?? copy.renderSceneError : copy.downloadScene;
  return <button
    type="button"
    className={styles.button}
    disabled={!supported || state === "rendering"}
    aria-label={label}
    title={label}
    onClick={() => void handleDownload()}
  >
    {state === "rendering" ? <span className={styles.spinner} aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" />
    </svg>}
  </button>;
}

function assertReady(render: SceneRender): asserts render is SceneRender & { status: "ready" } {
  if (render.status !== "ready") throw new Error(render.error || "scene render failed");
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFileName(value: string | undefined): string {
  return value?.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 100) ?? "";
}
