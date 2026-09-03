import { clampUnit, sceneTitleSafeInsetRatio, type FocusPoint } from "@storyteller/domain";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { classNames } from "../../class-names.js";
import styles from "./SceneTitleOverlay.module.css";

interface SceneTitlePositionEditorProps {
  readonly position: FocusPoint;
  readonly label: string;
  readonly disabled: boolean;
  readonly children: ReactNode;
  readonly onCommit: (position: FocusPoint) => void;
}

export function SceneTitlePositionEditor({ position, label, disabled, children, onCommit }: SceneTitlePositionEditorProps) {
  const [draft, setDraft] = useState(position);
  const [dragging, setDragging] = useState(false);
  const [outsideSafeZone, setOutsideSafeZone] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLButtonElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    setDraft(position);
  }, [position]);

  useLayoutEffect(() => {
    const update = () => {
      setOutsideSafeZone(isOutsideSafeZone(surface.current, control.current));
      setDraft((current) => {
        const clamped = clampToFrame(surface.current, control.current, current);
        return clamped.x === current.x && clamped.y === current.y ? current : clamped;
      });
    };
    update();
    if (!surface.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(surface.current);
    if (control.current) observer.observe(control.current);
    return () => observer.disconnect();
  }, [children, draft]);

  function pointFromPointer(clientX: number, clientY: number): FocusPoint {
    const bounds = surface.current?.getBoundingClientRect();
    const titleBounds = control.current?.getBoundingClientRect();
    if (!bounds || !titleBounds || !bounds.width || !bounds.height) return draft;
    const halfX = Math.min(0.5, titleBounds.width / bounds.width / 2);
    const halfY = Math.min(0.5, titleBounds.height / bounds.height / 2);
    const titleCenterX = clientX - dragOffset.current.x;
    const titleCenterY = clientY - dragOffset.current.y;
    return {
      x: Math.max(halfX, Math.min(1 - halfX, (titleCenterX - bounds.left) / bounds.width)),
      y: Math.max(halfY, Math.min(1 - halfY, (titleCenterY - bounds.top) / bounds.height)),
    };
  }

  function moveByKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    const movement = event.shiftKey ? 0.05 : 0.01;
    const delta = event.key === "ArrowLeft" ? { x: -movement, y: 0 }
      : event.key === "ArrowRight" ? { x: movement, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -movement }
          : event.key === "ArrowDown" ? { x: 0, y: movement }
            : undefined;
    if (!delta) return;
    event.preventDefault();
    const changed = clampToFrame(surface.current, control.current, {
      x: clampUnit(draft.x + delta.x), y: clampUnit(draft.y + delta.y),
    });
    setDraft(changed);
    onCommit(changed);
  }

  return <div className={styles.positionSurface} ref={surface}>
    <div className={classNames(styles.safeZone, outsideSafeZone && styles.safeZoneWarning)} aria-hidden="true" />
    <button
      ref={control}
      type="button"
      className={classNames(
        styles.positionControl,
        dragging && styles.positionDragging,
        outsideSafeZone && styles.positionWarning,
      )}
      aria-label={label}
      title={outsideSafeZone ? `${label} · safe zone` : label}
      disabled={disabled}
      draggable={false}
      style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.currentTarget.focus();
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        dragOffset.current = {
          x: event.clientX - (bounds.left + bounds.width / 2),
          y: event.clientY - (bounds.top + bounds.height / 2),
        };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        setDraft(pointFromPointer(event.clientX, event.clientY));
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.stopPropagation();
        const changed = pointFromPointer(event.clientX, event.clientY);
        setDraft(changed);
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit(changed);
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        setDraft(position);
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => setDragging(false)}
      onKeyDown={moveByKeyboard}
    >{children}<span className={styles.positionHint} aria-hidden="true">✣</span></button>
  </div>;
}

function clampToFrame(surface: HTMLDivElement | null, title: HTMLButtonElement | null, point: FocusPoint): FocusPoint {
  const bounds = surface?.getBoundingClientRect();
  const titleBounds = title?.getBoundingClientRect();
  if (!bounds || !titleBounds || !bounds.width || !bounds.height) return point;
  const halfX = Math.min(0.5, titleBounds.width / bounds.width / 2);
  const halfY = Math.min(0.5, titleBounds.height / bounds.height / 2);
  return { x: Math.max(halfX, Math.min(1 - halfX, point.x)), y: Math.max(halfY, Math.min(1 - halfY, point.y)) };
}

function isOutsideSafeZone(surface: HTMLDivElement | null, title: HTMLButtonElement | null): boolean {
  const bounds = surface?.getBoundingClientRect();
  const titleBounds = title?.getBoundingClientRect();
  if (!bounds || !titleBounds) return false;
  return titleBounds.left < bounds.left + bounds.width * sceneTitleSafeInsetRatio
    || titleBounds.right > bounds.right - bounds.width * sceneTitleSafeInsetRatio
    || titleBounds.top < bounds.top + bounds.height * sceneTitleSafeInsetRatio
    || titleBounds.bottom > bounds.bottom - bounds.height * sceneTitleSafeInsetRatio;
}
