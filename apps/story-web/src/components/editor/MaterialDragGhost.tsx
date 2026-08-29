import { createPortal } from "react-dom";
import { getMaterialPresentation, type AuthSession, type SceneMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import styles from "./MaterialDragGhost.module.css";
import timelineStyles from "./MaterialTimeline.module.css";

interface MaterialDragGhostProps {
  readonly material: SceneMaterial;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly dropping: boolean;
  readonly movingToScene: boolean;
}

export function MaterialDragGhost({ material, storyId, session, x, y, offsetX, offsetY, width, height, dropping, movingToScene }: MaterialDragGhostProps) {
  return createPortal(
    <article
      aria-hidden="true"
      className={classNames(styles.ghost, movingToScene && styles.movingToScene, dropping && styles.dropping)}
      style={{ width, height, transform: `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) scale(${dropping ? 1 : 1.03})` }}
    >
      <div className={classNames(timelineStyles.thumb, timelineStyles[getMaterialPresentation(material).orientation], styles.thumb)}>
        <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="timeline" />
      </div>
      {movingToScene && <span className={styles.destination}>→</span>}
    </article>,
    document.body,
  );
}
