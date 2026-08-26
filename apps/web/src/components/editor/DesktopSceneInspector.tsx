import { useEffect, useState } from "react";
import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneInspector } from "./SceneInspector.js";
import { isSingleImageScene } from "./scene-renderer-model.js";
import styles from "./DesktopSceneInspector.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface DesktopSceneInspectorProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly compact: boolean;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly onChange: (change: SceneChange) => void;
}

export function DesktopSceneInspector({ scene, copy, saving, compact, storyId, session, onChange }: DesktopSceneInspectorProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!compact || !open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compact, open]);

  if (compact && !open) return (
    <aside className={classNames(styles.inspector, styles.collapsed)} aria-label={copy.sceneTools}>
      <div className={styles.rail}>
        <button type="button" aria-label={copy.layout} title={copy.layout} onClick={() => setOpen(true)}>{isSingleImageScene(scene) ? "◎" : "▦"}</button>
      </div>
    </aside>
  );

  return (
    <aside className={classNames(styles.inspector, compact && styles.open)}>
      <div className={classNames(styles.head, compact && styles.withClose)}>
        <h2 className={styles.title}>{copy.layout}</h2>
        {compact && <button type="button" className={styles.close} aria-label={copy.close} onClick={() => setOpen(false)}>×</button>}
      </div>
      <div className={styles.content}>
        <SceneInspector
          scene={scene}
          copy={copy}
          saving={saving}
          storyId={storyId}
          session={session}
          variant="desktop"
          onChange={onChange}
        />
      </div>
    </aside>
  );
}
