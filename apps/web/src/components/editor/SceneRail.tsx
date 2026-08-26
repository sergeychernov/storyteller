import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./SceneRail.module.css";

interface SceneRailProps {
  readonly scenes: readonly Scene[];
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly adding: boolean;
  readonly variant?: "default" | "desktop";
}

export function SceneRail({ scenes, selectedId, copy, onSelect, onAdd, adding, variant = "default" }: SceneRailProps) {
  return (
    <aside className={classNames(styles.rail, variant === "desktop" && styles.desktop)}>
      <div className={styles.sectionHead}><h2>{copy.scenes}</h2><span>{scenes.length}</span></div>
      <div className={styles.list}>
        {scenes.map((scene, index) => (
          <button className={classNames(styles.tab, scene.id === selectedId && styles.active)} key={scene.id} onClick={() => onSelect(scene.id)}>
            <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
            <span><strong>{scene.title || `${copy.scene} ${index + 1}`}</strong><small>{scene.durationSeconds} {copy.seconds} · {scene.materials.length}</small></span>
          </button>
        ))}
      </div>
      <button className={classNames(sharedStyles.secondaryButton, styles.addButton, adding && sharedStyles.loading)} disabled={adding} onClick={onAdd}>{adding ? copy.creatingScene : `＋ ${copy.addScene}`}</button>
    </aside>
  );
}
