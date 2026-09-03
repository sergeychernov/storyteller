import { Link } from "react-router-dom";
import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { storyEditorPath } from "./scene-deletion-model.js";
import styles from "./DesktopEditorHeader.module.css";

interface DesktopEditorHeaderProps {
  readonly storyTitle: string | undefined;
  readonly storyId: string;
  readonly scenes: readonly Scene[];
  readonly selected: Scene | undefined;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly compact: boolean;
}

export function DesktopEditorHeader({ storyTitle, storyId, scenes, selected, copy, saving, compact }: DesktopEditorHeaderProps) {
  const selectedIndex = selected ? scenes.findIndex(({ id }) => id === selected.id) : -1;

  return (
    <header className={classNames(styles.header, compact && styles.compact)}>
      <Link className={styles.back} to="/">‹ <span>{copy.allStories}</span></Link>
      <div className={styles.title}>
        <strong>{storyTitle || copy.untitledStory}</strong>
        <small>{selected ? selected.title?.text || `${copy.scene} ${selectedIndex + 1}` : copy.noScenes}{selected ? ` · ${selectedIndex + 1}/${scenes.length}` : ""}</small>
      </div>
      <div className={styles.actions}>
        <span className={classNames(styles.saveState, saving && styles.saving)} role="status">
          <i aria-hidden="true">{saving ? "●" : "✓"}</i>
          {saving ? copy.saving : copy.saved}
        </span>
        {saving
          ? <span className={classNames(styles.preview, styles.previewDisabled)} aria-disabled="true">▶ {copy.storyPreview}</span>
          : <Link className={styles.preview} to={`/${storyId}/preview`}
              state={{ returnTo: storyEditorPath(storyId, selected?.id ?? "") }}>▶ {copy.storyPreview}</Link>}
      </div>
    </header>
  );
}
