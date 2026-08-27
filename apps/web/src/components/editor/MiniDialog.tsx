import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { classNames } from "../../class-names.js";
import styles from "./MiniDialog.module.css";

interface MiniDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly closeLabel: string;
  readonly closeDisabled?: boolean;
  readonly children: ReactNode;
  readonly width?: "default" | "wide";
  readonly variant?: "default" | "editor";
  readonly onClose: () => void;
}

export function MiniDialog({ open, title, closeLabel, closeDisabled = false, children, width = "default", variant = "default", onClose }: MiniDialogProps) {
  useEffect(() => {
    if (!open || closeDisabled) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, closeDisabled]);

  useEffect(() => {
    if (!open || variant !== "editor") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open, variant]);

  if (!open) return null;
  return createPortal(
    <div className={classNames(styles.backdrop, variant === "editor" && styles.editorBackdrop)} onMouseDown={(event) => { if (!closeDisabled && event.currentTarget === event.target) onClose(); }}>
      <section className={classNames(styles.dialog, width === "wide" && styles.wide, variant === "editor" && styles.editorDialog)} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button type="button" aria-label={closeLabel} disabled={closeDisabled} onClick={onClose}>×</button></header>
        {variant === "editor" ? <div className={styles.editorContent}>{children}</div> : children}
      </section>
    </div>,
    document.body,
  );
}
