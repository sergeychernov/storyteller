import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { PopupMenuButton } from "./PopupMenuButton.js";

describe("PopupMenuButton", () => {
  test("supports keyboard navigation, skips disabled actions and selects an item", async () => {
    const edit = vi.fn();
    const remove = vi.fn();
    const user = userEvent.setup();
    render(<PopupMenuButton label="Material actions" items={[
      { id: "edit", label: "Edit", onSelect: edit },
      { id: "info", label: "Info", disabled: true, onSelect: vi.fn() },
      { id: "delete", label: "Delete", danger: true, onSelect: remove },
    ]} />);

    await user.click(screen.getByRole("button", { name: "Material actions" }));

    expect(screen.getByRole("menu", { name: "Material actions" })).toBeTruthy();
    const editItem = screen.getByRole("menuitem", { name: "Edit" });
    await waitFor(() => expect(document.activeElement).toBe(editItem));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(edit).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu", { name: "Material actions" })).toBeNull();
  });

  test("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<PopupMenuButton label="Material actions" items={[
      { id: "edit", label: "Edit", onSelect: vi.fn() },
    ]} />);
    const trigger = screen.getByRole("button", { name: "Material actions" });

    await user.click(trigger);
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
