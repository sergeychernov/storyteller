import { useId } from "react";
import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneDownloadButton.module.css";
import { useSceneDownload } from "./use-scene-download.js";

interface SceneDownloadButtonProps {
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly copy: EditorCopy;
}

export function SceneDownloadButton({ scene, storyId, session, copy }: SceneDownloadButtonProps) {
  const { supported, state, error, download, file } = useSceneDownload(scene, storyId, session, copy);
  const errorId = useId();
  const label = state === "rendering" ? copy.renderingScene : copy.downloadScene;
  const icon = state === "rendering" ? <span className={styles.spinner} aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" />
  </svg>;
  return <span className={styles.control}>
    {file ? <a className={styles.button} href={file.url} download={file.filename} aria-label={label} title={label}>
      {icon}
    </a> : <button
      type="button"
      className={styles.button}
      disabled={!supported || state === "rendering"}
      aria-label={label}
      aria-describedby={error ? errorId : undefined}
      title={error ?? label}
      onClick={() => void download()}
    >
      {icon}
    </button>}
    {error && <span className={styles.error} id={errorId} role="alert">{error}</span>}
  </span>;
}
