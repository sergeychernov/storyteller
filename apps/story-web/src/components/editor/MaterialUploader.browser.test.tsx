import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { EffectiveAccess } from "../../api.js";
import { AccessProvider } from "../../access-control.js";
import { getEditorCopy } from "./editor-copy.js";
import { MaterialUploader } from "./MaterialUploader.js";

describe("MaterialUploader", () => {
  test("makes the native file input cover the upload card and uploads every selected file", () => {
    const onUpload = vi.fn();
    const { container } = renderUploader({ onUpload });
    const first = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const second = new File(["second"], "second.mp4", { type: "video/mp4" });

    const input = screen.getByLabelText("Upload materials") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe("image/*,video/*");
    expect(input.className).toContain("fileInput");
    expect(container.querySelector("button")).toBeNull();

    fireEvent.change(input, { target: { files: [first, second] } });
    expect(onUpload).toHaveBeenCalledWith([first, second]);
  });

  test("does not upload when the native picker is canceled", () => {
    const onUpload = vi.fn();
    renderUploader({ onUpload });

    fireEvent.change(screen.getByLabelText("Upload materials"), { target: { files: [] } });
    expect(onUpload).not.toHaveBeenCalled();
  });

  test("keeps the picker disabled while another editor mutation is pending", () => {
    renderUploader({ disabled: true });
    expect((screen.getByLabelText("Upload materials") as HTMLInputElement).disabled).toBe(true);
  });
});

function renderUploader(overrides: Partial<Parameters<typeof MaterialUploader>[0]> = {}) {
  return render(<AccessProvider access={access}>
    <MaterialUploader
      copy={getEditorCopy("en")}
      disabled={false}
      uploading={false}
      uploadCount={0}
      onUpload={vi.fn()}
      {...overrides}
    />
  </AccessProvider>);
}

const access: EffectiveAccess = {
  planVersionCode: null,
  roles: [],
  capabilities: [{ code: "media.upload", allowed: true, sources: [] }],
  limits: [],
  evaluatedAt: "2026-08-30T00:00:00.000Z",
};
