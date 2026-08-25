import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";

interface SceneSwitcherSheetProps {
  readonly open: boolean;
  readonly scenes: readonly Scene[];
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly adding: boolean;
  readonly onClose: () => void;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
}

export function SceneSwitcherSheet({ open, scenes, selectedId, copy, adding, onClose, onSelect, onAdd }: SceneSwitcherSheetProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div className="scene-switcher-backdrop" onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="scene-switcher-sheet" role="dialog" aria-modal="true" aria-label={copy.scenes}>
        <div className="scene-switcher-grabber" />
        <header>
          <div><h2>{copy.scenes}</h2><span>{scenes.length}</span></div>
          <button type="button" aria-label={copy.close} onClick={onClose}>×</button>
        </header>
        <div className="scene-switcher-list">
          {scenes.map((scene, index) => (
            <button
              type="button"
              className={scene.id === selectedId ? "active" : ""}
              key={scene.id}
              onClick={() => { onSelect(scene.id); onClose(); }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{scene.title || `${copy.scene} ${index + 1}`}</strong>
              <small>{scene.durationSeconds} {copy.seconds} · {scene.materials.length}</small>
            </button>
          ))}
          {!scenes.length && <p>{copy.noScenes}</p>}
        </div>
        <button
          type="button"
          className={`scene-switcher-add ${adding ? "loading-button" : ""}`}
          disabled={adding}
          onClick={() => { onAdd(); onClose(); }}
        >
          {adding ? copy.creatingScene : `＋ ${copy.createScene}`}
        </button>
      </section>
    </div>,
    document.body,
  );
}
