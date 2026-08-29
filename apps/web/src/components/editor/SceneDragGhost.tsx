import { createPortal } from "react-dom";
import type { AuthSession } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { formatSceneDuration } from "./scene-duration-model.js";
import type { SceneDragVisual } from "./use-scene-drag.js";
import { SceneFrameImage } from "./SceneFrameImage.js";
import styles from "./SceneDragGhost.module.css";

interface SceneDragGhostProps extends SceneDragVisual {
  readonly storyId?: string;
  readonly session?: AuthSession;
  readonly copy: EditorCopy;
}

export function SceneDragGhost({
  scene, index, x, y, offsetX, offsetY, width, height, dropping, storyId, session, copy,
}: SceneDragGhostProps) {
  return createPortal(
    <div
      aria-hidden="true"
      className={classNames(styles.ghost, dropping && styles.dropping)}
      style={{ width, height, transform: `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) scale(${dropping ? 1 : 1.02})` }}
    >
      <span className={styles.thumbnail}>
        {storyId && session && <SceneFrameImage scene={scene} storyId={storyId} session={session} presentation="timeline" />}
        <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
      </span>
      <span className={styles.details}>
        <strong>{scene.title || `${copy.scene} ${index + 1}`}</strong>
        <small>{formatSceneDuration(scene)} {copy.seconds} · {scene.materials.length}</small>
      </span>
      <span className={styles.handle}>⠿</span>
    </div>,
    document.body,
  );
}
