import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface MiniDialogButtonProps {
  readonly code: string;
  readonly label: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
}

export function MiniDialogButton({ code, label, title, closeLabel, children }: MiniDialogButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <>
    <button type="button" className="mini-action" aria-label={label} title={label} onClick={() => setOpen(true)}>{code}</button>
    {open && createPortal(
      <div className="mini-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
        <section className="mini-dialog" role="dialog" aria-modal="true" aria-label={title}>
          <header><h3>{title}</h3><button type="button" aria-label={closeLabel} onClick={() => setOpen(false)}>×</button></header>
          {children}
        </section>
      </div>,
      document.body,
    )}
  </>;
}
