import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneSwitcherSheet } from "./SceneSwitcherSheet.js";
import styles from "./SceneEditorHeader.module.css";

interface SceneEditorHeaderProps {
  readonly storyTitle: string | undefined;
  readonly scenes: readonly Scene[];
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly adding: boolean;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
}

export function SceneEditorHeader({ storyTitle, scenes, selectedId, copy, saving, adding, onSelect, onAdd }: SceneEditorHeaderProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);
  const selectedIndex = scenes.findIndex(({ id }) => id === selectedId);
  const selected = selectedIndex >= 0 ? scenes[selectedIndex] : undefined;
  return <>
    <header className={styles.header}>
      <Link className={styles.back} to="/stories" aria-label={copy.allStories}>‹</Link>
      <button type="button" className={styles.title} aria-haspopup="dialog" onClick={() => setSwitcherOpen(true)}>
        <strong>{selected ? selected.title || `${copy.scene} ${selectedIndex + 1}` : copy.noScenes} <span>⌄</span></strong>
        <small>{storyTitle || copy.untitledStory}{scenes.length ? ` · ${selectedIndex + 1}/${scenes.length}` : ""}</small>
      </button>
      <span className={classNames(styles.saveState, saving && styles.saving)} role="status" aria-label={saving ? copy.saving : copy.saved}>
        {saving ? "●" : "✓"}
      </span>
    </header>
    <SceneSwitcherSheet
      open={switcherOpen}
      scenes={scenes}
      selectedId={selectedId}
      copy={copy}
      adding={adding}
      onClose={closeSwitcher}
      onSelect={onSelect}
      onAdd={onAdd}
    />
  </>;
}
