import { describe, expect, it, vi } from "vitest";
import { createSceneMediaLifecycle } from "./scene-media-lifecycle.js";

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
    const lifecycle = createSceneMediaLifecycle(video, (localTime) => localTime + 2);

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
    const lifecycle = createSceneMediaLifecycle(video, (localTime) => localTime);

    void lifecycle.prepare(0);
    expect(add).toHaveBeenCalledTimes(2);
    lifecycle.dispose();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("deduplicates overlapping play requests and honors pause while play is pending", async () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { configurable: true, value: 10 },
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_FUTURE_DATA },
      paused: { configurable: true, value: true },
      currentTime: { configurable: true, writable: true, value: 0 },
    });
    let resolvePlay: (() => void) | undefined;
    const play = vi.spyOn(video, "play").mockImplementation(() => new Promise<void>((resolve) => { resolvePlay = resolve; }));
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);
    const lifecycle = createSceneMediaLifecycle(video, (localTime) => localTime);

    const first = lifecycle.play(1);
    const overlapping = lifecycle.play(1.1);
    expect(play).toHaveBeenCalledOnce();
    lifecycle.pause();
    resolvePlay?.();
    await Promise.all([first, overlapping]);

    expect(pause).toHaveBeenCalledOnce();
  });

  it("does not turn an interrupted play request into a scene failure", async () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { configurable: true, value: 10 },
      paused: { configurable: true, value: true },
      currentTime: { configurable: true, writable: true, value: 0 },
    });
    let rejectPlay: ((reason: unknown) => void) | undefined;
    vi.spyOn(video, "play").mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectPlay = reject; }));
    vi.spyOn(video, "pause").mockImplementation(() => undefined);
    const lifecycle = createSceneMediaLifecycle(video, (localTime) => localTime);

    const request = lifecycle.play(1);
    lifecycle.pause();
    rejectPlay?.(new DOMException("interrupted", "AbortError"));

    await expect(request).resolves.toBeUndefined();
  });

  it("still exposes a real play failure", async () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { configurable: true, value: 10 },
      paused: { configurable: true, value: true },
      currentTime: { configurable: true, writable: true, value: 0 },
    });
    vi.spyOn(video, "play").mockRejectedValue(new DOMException("unsupported", "NotSupportedError"));
    const lifecycle = createSceneMediaLifecycle(video, (localTime) => localTime);

    await expect(lifecycle.play(1)).rejects.toMatchObject({ name: "NotSupportedError" });
  });
});
