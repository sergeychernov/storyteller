import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneDownloadButton } from "./SceneDownloadButton.js";
import { SceneDebugButton } from "./SceneDebugButton.js";
import styles from "./ScenePreviewActions.module.css";

export function ScenePreviewActions({ scene, storyId, session, copy, deleteDisabled, onDeleteScene }: {
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly copy: EditorCopy;
  readonly deleteDisabled: boolean;
  readonly onDeleteScene: (sceneId: string) => void;
}) {
  return <span className={styles.actions}>
    <SceneDownloadButton scene={scene} storyId={storyId} session={session} copy={copy} />
    <SceneDebugButton scene={scene} copy={copy} />
    <button type="button" className={styles.deleteButton} disabled={deleteDisabled}
      aria-label={copy.deleteScene} title={copy.deleteScene} aria-haspopup="dialog" onClick={() => onDeleteScene(scene.id)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
      </svg>
    </button>
  </span>;
}
