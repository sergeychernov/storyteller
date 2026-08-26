import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./SceneEdgeActions.module.css";

interface SceneEdgeActionsProps {
  readonly copy: EditorCopy;
  readonly adding: boolean;
  readonly active: boolean;
  readonly onAdd: () => void;
  readonly variant?: "default" | "carouselEmpty" | "desktopEmpty";
  readonly adjacent?: "previous" | "next" | undefined;
  readonly dimmed?: boolean;
}

export function SceneEdgeActions({ copy, adding, active, onAdd, variant = "default", adjacent, dimmed = false }: SceneEdgeActionsProps) {
  return (
    <div className={classNames(
      styles.actions,
      variant !== "default" && styles[variant],
      adjacent && styles[adjacent],
      dimmed && styles.dimmed,
    )}>
      <span className={styles.mark}>＋</span>
      <p>{copy.sceneEdgeHint}</p>
      <div className={styles.buttons}>
        <button
          type="button"
          className={classNames(styles.primaryAction, adding && sharedStyles.loading)}
          disabled={adding}
          tabIndex={active ? 0 : -1}
          onClick={onAdd}
        >
          {adding ? copy.creatingScene : `＋ ${copy.createScene}`}
        </button>
        <button type="button" className={sharedStyles.secondaryButton} disabled tabIndex={active ? 0 : -1} title={copy.coverEditorPending}>
          {copy.createCover}
        </button>
      </div>
      <small>{copy.coverEditorPending}</small>
    </div>
  );
}
