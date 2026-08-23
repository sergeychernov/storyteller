import type { Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";

interface SceneRailProps {
  readonly scenes: readonly Scene[];
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly adding: boolean;
}

export function SceneRail({ scenes, selectedId, copy, onSelect, onAdd, adding }: SceneRailProps) {
  return (
    <aside className="scene-rail">
      <div className="editor-section-head"><h2>{copy.scenes}</h2><span>{scenes.length}</span></div>
      <div className="scene-list">
        {scenes.map((scene, index) => (
          <button className={`scene-tab ${scene.id === selectedId ? "active" : ""}`} key={scene.id} onClick={() => onSelect(scene.id)}>
            <span className="scene-number">{String(index + 1).padStart(2, "0")}</span>
            <span><strong>{scene.title || `${copy.scene} ${index + 1}`}</strong><small>{scene.durationSeconds} {copy.seconds} · {scene.materials.length}</small></span>
          </button>
        ))}
      </div>
      <button className={`secondary-button add-scene-button ${adding ? "loading-button" : ""}`} disabled={adding} onClick={onAdd}>{adding ? copy.creatingScene : `＋ ${copy.addScene}`}</button>
    </aside>
  );
}
