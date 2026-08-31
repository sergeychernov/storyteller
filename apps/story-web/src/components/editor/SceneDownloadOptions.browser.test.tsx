import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { getEditorCopy } from "./editor-copy.js";
import { SceneDownloadOptions } from "./SceneDownloadOptions.js";

describe("SceneDownloadOptions", () => {
  test("shows persisted render phase and FFmpeg percentage", () => {
    render(<SceneDownloadOptions copy={getEditorCopy("en")} supported isVideo={false} hasAudio={false} rendering
      progress={{ id: "render", current: true, status: "running", progressPercent: 48, progressPhase: "rendering" }}
      preparedDownloads={{}} error={undefined} onDownload={vi.fn()} onPreparedDownload={vi.fn()} onClose={vi.fn()} />);

    const progress = screen.getByRole("progressbar", { name: "Rendering scene… 48%" }) as HTMLProgressElement;
    expect(progress.value).toBe(48);
    expect(screen.getByText("48%").textContent).toBe("48%");
  });

  test("turns a prepared render into a direct browser download link", () => {
    const onPreparedDownload = vi.fn();
    render(<SceneDownloadOptions copy={getEditorCopy("en")} supported isVideo={false} hasAudio={false} rendering={false}
      progress={undefined}
      preparedDownloads={{ video: { url: "blob:http://localhost/render", filename: "scene-video.mp4" } }}
      error={undefined} onDownload={vi.fn()} onPreparedDownload={onPreparedDownload} onClose={vi.fn()} />);

    const link = screen.getByRole("link", { name: /Video only.*MP4 · Ready/ }) as HTMLAnchorElement;
    expect(link.href).toBe("blob:http://localhost/render");
    expect(link.download).toBe("scene-video.mp4");
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(onPreparedDownload).toHaveBeenCalledWith("video");
  });

  test("requests rendering before the download is prepared", () => {
    const onDownload = vi.fn();
    render(<SceneDownloadOptions copy={getEditorCopy("en")} supported isVideo={false} hasAudio={false} rendering={false}
      progress={undefined}
      preparedDownloads={{}} error={undefined} onDownload={onDownload} onPreparedDownload={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Video only.*MP4/ }));
    expect(onDownload).toHaveBeenCalledWith("video");
  });

  test("continues the original click by downloading as soon as rendering finishes", () => {
    const onDownload = vi.fn();
    const onPreparedDownload = vi.fn();
    const nativeClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      this.addEventListener("click", (event) => event.preventDefault(), { once: true });
      this.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    const props = {
      copy: getEditorCopy("en"),
      supported: true, isVideo: false, hasAudio: false, rendering: false,
      progress: undefined,
      error: undefined, onDownload, onPreparedDownload, onClose: vi.fn(),
    };
    const { rerender } = render(<SceneDownloadOptions {...props} preparedDownloads={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /Video only.*MP4/ }));
    expect(onDownload).toHaveBeenCalledWith("video");

    const preparedDownloads = { video: { url: "blob:http://localhost/new-render", filename: "scene-video.mp4" } };
    rerender(<SceneDownloadOptions {...props} preparedDownloads={preparedDownloads} />);

    expect(nativeClick).toHaveBeenCalledOnce();
    expect(onPreparedDownload).toHaveBeenCalledWith("video");

    rerender(<SceneDownloadOptions {...props} preparedDownloads={preparedDownloads} />);
    expect(nativeClick).toHaveBeenCalledOnce();
  });
});
