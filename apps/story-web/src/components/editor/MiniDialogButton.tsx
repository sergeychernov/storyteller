import { useRef, useState, type ReactNode } from "react";
import { classNames } from "../../class-names.js";
import { MiniDialog } from "./MiniDialog.js";
import styles from "./MiniDialogButton.module.css";

interface MiniDialogButtonProps {
  readonly code: string;
  readonly label: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly inverted?: boolean;
}

export function MiniDialogButton({ code, label, title, closeLabel, children, inverted = false }: MiniDialogButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return <>
    <button ref={triggerRef} type="button" className={classNames(styles.action, inverted && styles.inverted)} aria-label={label} title={label} onClick={() => setOpen(true)}>{code}</button>
    <MiniDialog open={open} title={title} closeLabel={closeLabel} returnFocusRef={triggerRef} onClose={() => setOpen(false)}>{children}</MiniDialog>
  </>;
}
