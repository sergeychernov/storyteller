import { clampUnit } from "@storyteller/domain";
import { useEffect, useState } from "react";
import type { FocusPoint } from "../../api.js";
import { focusPointFromClient } from "./focus-point-model.js";
import styles from "./FocusPointEditor.module.css";

interface FocusPointEditorProps {
  readonly focusPoint: FocusPoint;
  readonly label: string;
  readonly disabled: boolean;
  readonly onCommit: (focusPoint: FocusPoint) => void;
}

export function FocusPointEditor({ focusPoint, label, disabled, onCommit }: FocusPointEditorProps) {
  const [draft, setDraft] = useState(focusPoint);

  useEffect(() => setDraft(focusPoint), [focusPoint]);

  function pointFromPointer(target: HTMLButtonElement, clientX: number, clientY: number): FocusPoint {
    const bounds = target.parentElement?.getBoundingClientRect();
    if (!bounds) return draft;
    return focusPointFromClient(bounds, clientX, clientY);
  }

  function moveByKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    const movement = event.shiftKey ? 0.1 : 0.02;
    const delta = event.key === "ArrowLeft" ? { x: -movement, y: 0 }
      : event.key === "ArrowRight" ? { x: movement, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -movement }
          : event.key === "ArrowDown" ? { x: 0, y: movement }
            : undefined;
    if (!delta) return;
    event.preventDefault();
    const changed = { x: clampUnit(draft.x + delta.x), y: clampUnit(draft.y + delta.y) };
    setDraft(changed);
    onCommit(changed);
  }

  return <div className={styles.surface} aria-hidden={disabled}>
    <button
      type="button"
      className={styles.focus}
      aria-label={label}
      title={label}
      disabled={disabled}
      style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        setDraft(pointFromPointer(event.currentTarget, event.clientX, event.clientY));
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const changed = pointFromPointer(event.currentTarget, event.clientX, event.clientY);
        setDraft(changed);
        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit(changed);
      }}
      onPointerCancel={(event) => {
        setDraft(focusPoint);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onKeyDown={moveByKeyboard}
    ><span /></button>
  </div>;
}
