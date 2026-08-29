import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, test } from "vitest";
import { MiniDialog } from "./MiniDialog.js";

function DialogHarness({ closeDisabled = false }: { readonly closeDisabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open dialog</button>
    <MiniDialog
      open={open}
      title="Delete scene"
      closeLabel="Close"
      closeDisabled={closeDisabled}
      initialFocusRef={initialFocusRef}
      returnFocusRef={triggerRef}
      onClose={() => setOpen(false)}
    >
      <button ref={initialFocusRef} type="button">Cancel</button>
      <button type="button">Delete</button>
    </MiniDialog>
  </>;
}

describe("MiniDialog", () => {
  test("announces the title, focuses the requested action and returns focus after Escape", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Delete scene" })).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Delete scene" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("does not dismiss while closing is disabled", async () => {
    const user = userEvent.setup();
    render(<DialogHarness closeDisabled />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Delete scene" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toHaveProperty("disabled", true);
  });
});
