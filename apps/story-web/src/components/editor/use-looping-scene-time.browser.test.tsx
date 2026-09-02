import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoopingSceneTime } from "./use-looping-scene-time.js";

let now = 0;
let animationFrame: FrameRequestCallback | undefined;

beforeEach(() => {
  now = 0;
  animationFrame = undefined;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFrame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => { animationFrame = undefined; });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("editor scene clock", () => {
  it("holds local time while paused and resumes without counting the pause gap", () => {
    const { result, rerender } = renderHook(({ active }) => useLoopingSceneTime(active, 5, 0), {
      initialProps: { active: true },
    });
    frame(1_000);
    expect(result.current).toBe(1);

    rerender({ active: false });
    now = 3_000;
    expect(result.current).toBe(1);

    rerender({ active: true });
    frame(3_500);
    expect(result.current).toBe(1.5);
  });
});

function frame(milliseconds: number) {
  const callback = animationFrame;
  if (!callback) throw new Error("animation frame was not requested");
  now = milliseconds;
  act(() => callback(milliseconds));
}
