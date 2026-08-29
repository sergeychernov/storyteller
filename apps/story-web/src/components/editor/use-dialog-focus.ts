import { useEffect, type RefObject } from "react";

export function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null> | undefined, returnFocusRef: RefObject<HTMLElement | null> | undefined) {
  useEffect(() => {
    if (!open || !initialFocusRef) return;
    const previous = document.activeElement;
    initialFocusRef.current?.focus();
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      event.preventDefault();
      if (!buttons.length) { dialogRef.current?.focus(); return; }
      const current = buttons.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (current <= 0 ? buttons.length : current) - 1 : (current + 1) % buttons.length;
      buttons[next]?.focus();
    };
    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected && !previous.closest("[inert]")) previous.focus();
      else returnFocusRef?.current?.focus();
    };
  }, [open, dialogRef, initialFocusRef, returnFocusRef]);
}
