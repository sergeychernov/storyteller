import { Link } from "react-router-dom";
import type { Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";

interface DesktopEditorHeaderProps {
  readonly storyTitle: string | undefined;
  readonly scenes: readonly Scene[];
  readonly selected: Scene | undefined;
  readonly copy: EditorCopy;
  readonly saving: boolean;
}

export function DesktopEditorHeader({ storyTitle, scenes, selected, copy, saving }: DesktopEditorHeaderProps) {
  const selectedIndex = selected ? scenes.findIndex(({ id }) => id === selected.id) : -1;

  return (
    <header className="desktop-editor-header">
      <Link className="desktop-editor-back" to="/stories">‹ <span>{copy.allStories}</span></Link>
      <div className="desktop-editor-title">
        <strong>{storyTitle || copy.untitledStory}</strong>
        <small>{selected ? selected.title || `${copy.scene} ${selectedIndex + 1}` : copy.noScenes}{selected ? ` · ${selectedIndex + 1}/${scenes.length}` : ""}</small>
      </div>
      <span className={`desktop-save-state${saving ? " saving" : ""}`} role="status">
        <i aria-hidden="true">{saving ? "●" : "✓"}</i>
        {saving ? copy.saving : copy.saved}
      </span>
    </header>
  );
}
