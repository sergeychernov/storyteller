import { Link } from "react-router-dom";
import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneEditorHeader.module.css";

export type MobileEditorMode = "scene" | "timeline";

interface SceneEditorHeaderProps {
  readonly storyTitle: string | undefined;
  readonly scenes: readonly Scene[];
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly mode: MobileEditorMode;
  readonly onModeChange: (mode: MobileEditorMode) => void;
}

export function SceneEditorHeader({
  storyTitle, scenes, selectedId, copy, saving, mode, onModeChange,
}: SceneEditorHeaderProps) {
  const selectedIndex = scenes.findIndex(({ id }) => id === selectedId);
  const selected = selectedIndex >= 0 ? scenes[selectedIndex] : undefined;
  const selectedTitle = selected ? selected.title || `${copy.scene} ${selectedIndex + 1}` : copy.noScenes;
  const context = mode === "scene"
    ? `${selectedTitle}${scenes.length ? ` · ${selectedIndex + 1}/${scenes.length}` : ""}`
    : `${storyTitle || copy.untitledStory} · ${scenes.length} ${copy.scenes.toLocaleLowerCase()}`;
  return (
    <header className={styles.header}>
      <Link className={styles.back} to="/stories" aria-label={copy.allStories}>‹</Link>
      <div className={styles.center}>
        <div className={styles.modeSwitch} role="group" aria-label={copy.editorModes}>
          <button type="button" aria-pressed={mode === "scene"} onClick={() => onModeChange("scene")}>{copy.scene}</button>
          <button type="button" aria-pressed={mode === "timeline"} onClick={() => onModeChange("timeline")}>{copy.timeline}</button>
        </div>
        <span className={styles.context}>{context}</span>
      </div>
      <span className={classNames(styles.saveState, saving && styles.saving)} role="status" aria-label={saving ? copy.saving : copy.saved}>
        {saving ? "●" : "✓"}
      </span>
    </header>
  );
}
