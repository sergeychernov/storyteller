import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRef } from "react";
import { classNames } from "../../class-names.js";
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
  const firstEnabledItemRef = useRef<HTMLDivElement>(null);
  const firstEnabledItem = items.findIndex((item) => !item.disabled);

  return (
    <DropdownMenu.Root modal>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.trigger} aria-label={label} title={label} disabled={disabled}>...</button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.menu}
          aria-label={label}
          align="end"
          sideOffset={5}
          collisionPadding={8}
          loop
          onFocus={(event) => {
            if (event.currentTarget === event.target) firstEnabledItemRef.current?.focus();
          }}
        >
          {items.map((item, index) => (
            <DropdownMenu.Item
              ref={index === firstEnabledItem ? firstEnabledItemRef : null}
              className={classNames(styles.item, item.danger && styles.danger)}
              disabled={item.disabled ?? false}
              key={item.id}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
