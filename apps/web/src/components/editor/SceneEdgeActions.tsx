import type { EditorCopy } from "./editor-copy.js";

interface SceneEdgeActionsProps {
  readonly copy: EditorCopy;
  readonly adding: boolean;
  readonly active: boolean;
  readonly onAdd: () => void;
}

export function SceneEdgeActions({ copy, adding, active, onAdd }: SceneEdgeActionsProps) {
  return (
    <div className="scene-edge-actions">
      <span className="scene-edge-mark">＋</span>
      <p>{copy.sceneEdgeHint}</p>
      <div className="scene-edge-buttons">
        <button
          type="button"
          className={`primary-edge-action ${adding ? "loading-button" : ""}`}
          disabled={adding}
          tabIndex={active ? 0 : -1}
          onClick={onAdd}
        >
          {adding ? copy.creatingScene : `＋ ${copy.createScene}`}
        </button>
        <button type="button" className="secondary-button" disabled tabIndex={active ? 0 : -1} title={copy.coverEditorPending}>
          {copy.createCover}
        </button>
      </div>
      <small>{copy.coverEditorPending}</small>
    </div>
  );
}
