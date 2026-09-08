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

/** Drawn rather than typed, so narrowing the header cannot shrink it away with the label. */
const playGlyph = <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M8 5.2v13.6L19 12z" />
</svg>;

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
        <span className={classNames(styles.saveState, saving && styles.saving)} role="status"
          title={saving ? copy.saving : copy.saved}>
          <i aria-hidden="true">{saving ? "●" : "✓"}</i>
          <span className={styles.label}>{saving ? copy.saving : copy.saved}</span>
        </span>
        {saving
          ? <span className={classNames(styles.preview, styles.previewDisabled)} aria-disabled="true" title={copy.storyPreview}>
              {playGlyph}<span className={styles.label}>{copy.storyPreview}</span>
            </span>
          : <Link className={styles.preview} to={`/${storyId}/preview`} title={copy.storyPreview}
              state={{ returnTo: storyEditorPath(storyId, selected?.id ?? "") }}>
              {playGlyph}<span className={styles.label}>{copy.storyPreview}</span>
            </Link>}
      </div>
    </header>
  );
}
