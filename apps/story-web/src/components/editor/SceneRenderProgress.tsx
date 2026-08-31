import type { SceneRender } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneRenderProgress.module.css";

interface SceneRenderProgressProps {
  readonly render: Pick<SceneRender, "status" | "progressPercent" | "progressPhase">;
  readonly copy: EditorCopy;
  readonly announce?: boolean;
}

export function SceneRenderProgress({ render, copy, announce = true }: SceneRenderProgressProps) {
  if (render.status !== "queued" && render.status !== "running") return null;
  const labels = {
    queued: copy.renderProgressQueued,
    downloading: copy.renderProgressDownloading,
    rendering: copy.renderingScene,
    finalizing: copy.renderProgressFinalizing,
    uploading: copy.renderProgressUploading,
    ready: copy.renderReady,
  };
  const queued = render.status === "queued" || render.progressPhase === "queued";
  const percent = Math.max(0, Math.min(100, Math.round(render.progressPercent)));
  const label = labels[render.progressPhase];
  return <div className={styles.progress} {...(announce ? { role: "status" as const, "aria-live": "polite" as const } : {})}>
    <span><span>{label}</span>{!queued && <strong>{percent}%</strong>}</span>
    <progress max={100} {...(queued ? {} : { value: percent })} aria-label={queued ? label : `${label} ${percent}%`} />
  </div>;
}
