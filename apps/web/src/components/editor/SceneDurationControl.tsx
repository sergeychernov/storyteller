import { useEffect, useRef, useState } from "react";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneInspector.module.css";

interface SceneDurationControlProps {
  readonly durationSeconds: number;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly onCommit: (durationSeconds: number) => void;
}

export function SceneDurationControl({ durationSeconds, copy, saving, onCommit }: SceneDurationControlProps) {
  const [draft, setDraft] = useState(durationSeconds);
  const draftRef = useRef(durationSeconds);
  const committedRef = useRef(durationSeconds);
  useEffect(() => {
    draftRef.current = durationSeconds;
    committedRef.current = durationSeconds;
    setDraft(durationSeconds);
  }, [durationSeconds]);

  function commit() {
    if (draftRef.current === committedRef.current) return;
    committedRef.current = draftRef.current;
    onCommit(draftRef.current);
  }

  return (
    <section className={styles.durationControl}>
      <h2>{copy.duration}</h2>
      <input
        className={styles.durationSlider}
        type="range"
        min="3"
        max="15"
        step="0.5"
        value={draft}
        disabled={saving}
        aria-label={copy.duration}
        onChange={(event) => {
          const changed = Number(event.target.value);
          draftRef.current = changed;
          setDraft(changed);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <strong>{draft} {copy.seconds}</strong>
    </section>
  );
}
