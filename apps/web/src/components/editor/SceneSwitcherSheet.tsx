import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { formatSceneDuration } from "./scene-duration-model.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./SceneSwitcherSheet.module.css";

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
    <div className={styles.backdrop} onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={copy.scenes}>
        <div className={styles.grabber} />
        <header>
          <div><h2>{copy.scenes}</h2><span>{scenes.length}</span></div>
          <button type="button" aria-label={copy.close} onClick={onClose}>×</button>
        </header>
        <div className={styles.list}>
          {scenes.map((scene, index) => (
            <button
              type="button"
              className={scene.id === selectedId ? styles.active : undefined}
              key={scene.id}
              onClick={() => { onSelect(scene.id); onClose(); }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{scene.title || `${copy.scene} ${index + 1}`}</strong>
              <small>{formatSceneDuration(scene)} {copy.seconds} · {scene.materials.length}</small>
            </button>
          ))}
          {!scenes.length && <p>{copy.noScenes}</p>}
        </div>
        <button
          type="button"
          className={classNames(styles.add, adding && sharedStyles.loading)}
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
