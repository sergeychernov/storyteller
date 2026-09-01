import { describe, expect, it, vi } from "vitest";
import { createMediaRendererLifecycle } from "./preview-renderer-lifecycle.js";

describe("preview renderer lifecycle", () => {
  it("prepares, corrects drift over 80 ms, pauses, and disposes native media", async () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { configurable: true, value: 10 },
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_FUTURE_DATA },
      paused: { configurable: true, value: true },
      currentTime: { configurable: true, writable: true, value: 0 },
    });
    const play = vi.spyOn(video, "play").mockResolvedValue();
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);
    const load = vi.spyOn(video, "load").mockImplementation(() => undefined);
    video.src = "https://media.example/video.mp4";
    const lifecycle = createMediaRendererLifecycle(video, (localTime) => localTime + 2);

    await lifecycle.prepare(1);
    expect(video.currentTime).toBe(3);
    video.currentTime = 3.04;
    lifecycle.seek(1);
    expect(video.currentTime).toBe(3.04);
    lifecycle.seek(2);
    expect(video.currentTime).toBe(4);
    await lifecycle.play(2);
    expect(play).toHaveBeenCalledOnce();
    lifecycle.pause();
    lifecycle.dispose();
    expect(pause).toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it("removes pending preparation listeners on dispose", () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { configurable: true, value: Number.NaN },
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_NOTHING },
      paused: { configurable: true, value: true },
    });
    vi.spyOn(video, "pause").mockImplementation(() => undefined);
    vi.spyOn(video, "load").mockImplementation(() => undefined);
    const add = vi.spyOn(video, "addEventListener");
    const remove = vi.spyOn(video, "removeEventListener");
    const lifecycle = createMediaRendererLifecycle(video, (localTime) => localTime);

    void lifecycle.prepare(0);
    expect(add).toHaveBeenCalledTimes(2);
    lifecycle.dispose();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
