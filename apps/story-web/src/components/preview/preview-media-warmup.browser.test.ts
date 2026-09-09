import { afterEach, expect, it, vi } from "vitest";
import { warmPreviewMedia } from "./preview-media-warmup.js";
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("preloads from the trim offset and waits for future buffered frames without calling play", () => {
  const video = document.createElement("video");
  let end = 2.1;
  Object.defineProperties(video, {
    duration: { value: 10 }, readyState: { value: HTMLMediaElement.HAVE_FUTURE_DATA },
    buffered: { value: { length: 1, start: () => 2, end: () => end } },
  });
  const play = vi.spyOn(video, "play").mockResolvedValue();
  vi.spyOn(video, "load").mockImplementation(() => undefined);
  const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);
  vi.spyOn(document, "createElement").mockReturnValue(video);
  const done = vi.fn();
  const release = warmPreviewMedia("https://media.example/clip.mp4", "video", 2, done);
  video.dispatchEvent(new Event("loadedmetadata"));
  expect(video.currentTime).toBe(2);
  expect(done).not.toHaveBeenCalled();
  end = 5;
  video.dispatchEvent(new Event("progress"));
  expect(done).toHaveBeenCalledOnce();
  expect(play).not.toHaveBeenCalled();
  release();
  expect(video.hasAttribute("src")).toBe(false);
  expect(pause).toHaveBeenCalledOnce();
});
it("cancels a stalled speculative download so the queue can continue", () => {
  vi.useFakeTimers();
  const video = document.createElement("video");
  vi.spyOn(video, "load").mockImplementation(() => undefined);
  vi.spyOn(video, "pause").mockImplementation(() => undefined);
  vi.spyOn(document, "createElement").mockReturnValue(video);
  const done = vi.fn();
  warmPreviewMedia("https://media.example/slow.mp4", "video", 0, done);
  vi.advanceTimersByTime(15000);
  expect(done).toHaveBeenCalledOnce();
  expect(video.hasAttribute("src")).toBe(false);
});
