import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode, type RefObject } from "react";
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
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export function MiniDialog({ open, title, closeLabel, closeDisabled = false, children, width = "default", variant = "default", onClose, initialFocusRef, returnFocusRef }: MiniDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !closeDisabled) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={classNames(styles.backdrop, variant === "editor" && styles.editorBackdrop)} />
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef?.current) return;
            event.preventDefault();
            returnFocusRef.current.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (closeDisabled) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (closeDisabled) event.preventDefault();
          }}
        >
          <section className={classNames(styles.dialog, width === "wide" && styles.wide, variant === "editor" && styles.editorDialog)}>
            <header>
              <Dialog.Title asChild><h3>{title}</h3></Dialog.Title>
              <Dialog.Close asChild><button type="button" aria-label={closeLabel} disabled={closeDisabled}>×</button></Dialog.Close>
            </header>
            {variant === "editor" ? <div className={styles.editorContent}>{children}</div> : children}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
