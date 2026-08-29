import { useId, useState } from "react";
import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneDownloadButton.module.css";
import { useSceneDownload } from "./use-scene-download.js";
import { SceneDownloadOptions } from "./SceneDownloadOptions.js";
import { useCapability } from "../../access-control.js";

interface SceneDownloadButtonProps {
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly copy: EditorCopy;
}

export function SceneDownloadButton({ scene, storyId, session, copy }: SceneDownloadButtonProps) {
  const canRender = useCapability("scene.render");
  const { supported, state, error, download } = useSceneDownload(scene, storyId, session, copy);
  const [choosing, setChoosing] = useState(false);
  const video = scene.materials.length === 1 && scene.materials[0]?.kind === "video" ? scene.materials[0] : undefined;
  const errorId = useId();
  const label = state === "rendering" ? copy.renderingScene : copy.downloadScene;
  const icon = state === "rendering" ? <span className={styles.spinner} aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" />
  </svg>;
  if (!canRender) return null;
  return <span className={styles.control}>
    <button
      type="button"
      className={styles.button}
      disabled={state === "rendering"}
      aria-label={label}
      aria-describedby={error ? errorId : undefined}
      title={error ?? label}
      onClick={() => setChoosing(true)}
    >
      {icon}
    </button>
    {error && !choosing && <span className={styles.error} id={errorId} role="alert">{error}</span>}
    {choosing && <SceneDownloadOptions copy={copy} supported={supported} isVideo={Boolean(video)} hasAudio={video?.hasAudio ?? false}
      scene={scene} storyId={storyId} session={session} rendering={state === "rendering"} error={error}
      onClose={() => setChoosing(false)} onDownload={(mode) => void download(mode)} />}
  </span>;
}
