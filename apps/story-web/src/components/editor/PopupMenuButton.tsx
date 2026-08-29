import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./PopupMenuButton.module.css";

export interface PopupMenuItem {
  readonly id: string;
  readonly label: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

interface PopupMenuButtonProps {
  readonly label: string;
  readonly items: readonly PopupMenuItem[];
  readonly disabled?: boolean;
}

export function PopupMenuButton({ label, items, disabled = false }: PopupMenuButtonProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const open = position !== undefined;

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setPosition(undefined);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPosition(undefined);
      triggerRef.current?.focus();
    };
    const closeOnViewportChange = () => setPosition(undefined);
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  function toggle() {
    if (open) { setPosition(undefined); return; }
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = 196;
    const estimatedHeight = items.length * 36 + 12;
    setPosition({
      left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)),
      top: bounds.bottom + estimatedHeight + 8 <= window.innerHeight ? bounds.bottom + 5 : Math.max(8, bounds.top - estimatedHeight - 5),
    });
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowDown" ? (current + 1) % buttons.length
      : (current <= 0 ? buttons.length : current) - 1;
    buttons[next]?.focus();
  }

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={styles.trigger}
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      disabled={disabled}
      onClick={toggle}
    >...</button>
    {position && createPortal(
      <div
        ref={menuRef}
        id={menuId}
        className={styles.menu}
        style={{ "--menu-top": `${position.top}px`, "--menu-left": `${position.left}px` } as CSSProperties}
        role="menu"
        aria-label={label}
        onKeyDown={moveFocus}
      >
        {items.map((item) => <button
          type="button"
          role="menuitem"
          className={item.danger ? styles.danger : undefined}
          disabled={item.disabled}
          key={item.id}
          onClick={() => {
            setPosition(undefined);
            item.onSelect();
          }}
        >{item.label}</button>)}
      </div>,
      document.body,
    )}
  </>;
}
