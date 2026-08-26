import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./MiniDialog.module.css";

interface MiniDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}

export function MiniDialog({ open, title, closeLabel, children, onClose }: MiniDialogProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
