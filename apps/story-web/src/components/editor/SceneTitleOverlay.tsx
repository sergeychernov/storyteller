import { sceneTitleOpacity, type FocusPoint, type SceneTitle } from "@storyteller/domain";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { classNames } from "../../class-names.js";
import { SceneTitlePositionEditor } from "./SceneTitlePositionEditor.js";
import styles from "./SceneTitleOverlay.module.css";

interface SceneTitleOverlayProps {
  readonly title: SceneTitle;
  readonly localTimeSeconds: number;
  readonly editing?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly moveLabel?: string;
  readonly onCommitPosition?: ((position: FocusPoint) => void) | undefined;
}

export function SceneTitleOverlay({ title, localTimeSeconds, editing = false, disabled = false, moveLabel, onCommitPosition }: SceneTitleOverlayProps) {
  const content = <span className={classNames(
    styles.title,
    styles[title.style],
    styles[title.size],
    title.color === "#20201E" && styles.dark,
  )} style={{ color: title.color }}>{title.text || "…"}</span>;
  if (editing && onCommitPosition) return <SceneTitlePositionEditor
    position={title.position}
    label={moveLabel ?? "Move title"}
    disabled={disabled}
    onCommit={onCommitPosition}
  >{content}</SceneTitlePositionEditor>;
  const opacity = sceneTitleOpacity(title, localTimeSeconds);
  if (opacity <= 0) return null;
  return <ReadOnlyTitle position={title.position} opacity={opacity}>{content}</ReadOnlyTitle>;
}

function ReadOnlyTitle({ position, opacity, children }: {
  readonly position: FocusPoint; readonly opacity: number; readonly children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [displayPosition, setDisplayPosition] = useState(position);
  useLayoutEffect(() => {
    const update = () => setDisplayPosition(clampToFrame(surface.current, content.current, position));
    update();
    if (!surface.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(surface.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [children, position]);
  return <div ref={surface} className={styles.readOnlySurface} aria-hidden="true">
    <div ref={content} className={styles.readOnlyTitle} style={{
      left: `${displayPosition.x * 100}%`, top: `${displayPosition.y * 100}%`, opacity,
    }}>{children}</div>
  </div>;
}

function clampToFrame(surface: HTMLDivElement | null, content: HTMLDivElement | null, point: FocusPoint): FocusPoint {
  const bounds = surface?.getBoundingClientRect();
  const contentBounds = content?.getBoundingClientRect();
  if (!bounds || !contentBounds || !bounds.width || !bounds.height) return point;
  const halfX = Math.min(0.5, contentBounds.width / bounds.width / 2);
  const halfY = Math.min(0.5, contentBounds.height / bounds.height / 2);
  return {
    x: Math.max(halfX, Math.min(1 - halfX, point.x)),
    y: Math.max(halfY, Math.min(1 - halfY, point.y)),
  };
}
