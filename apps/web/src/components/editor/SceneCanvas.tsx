import type { CSSProperties } from "react";
import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import styles from "./SceneCanvas.module.css";

interface SceneCanvasProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly presentation: "carousel" | "desktop";
  readonly adjacent?: "previous" | "next" | undefined;
  readonly dimmed?: boolean;
  readonly inactive?: boolean;
}

export function SceneCanvas({ scene, copy, storyId, session, presentation, adjacent, dimmed = false, inactive = false }: SceneCanvasProps) {
  return (
    <div className={classNames(
      styles.canvas,
      scene.layoutId === "full-frame" && styles.fullFrame,
      scene.layoutId === "overlap-stack" && styles.overlapStack,
      styles[presentation],
      adjacent && styles[adjacent],
      dimmed && styles.dimmed,
      inactive && styles.inactive,
    )}>
      {scene.materials.length ? scene.materials.map((material, index) => (
        <div className={classNames(styles.material, styles[material.orientation])} key={material.id} style={{ "--material-index": index } as CSSProperties}>
          <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />
          <span className={styles.kindIcon}>{material.kind === "video" ? "▶" : "◫"}</span>
          <small className={styles.materialName}>{material.name}</small>
        </div>
      )) : <div className={styles.empty}><span>＋</span>{copy.emptyScene}</div>}
      <div className={styles.time}><i style={{ width: `${scene.durationSeconds / 15 * 100}%` }} /></div>
    </div>
  );
}
