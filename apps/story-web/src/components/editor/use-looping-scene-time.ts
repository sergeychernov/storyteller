import { useEffect, useRef, useState } from "react";

/** The only animation-frame clock used by scene and story playback. */
export function usePlaybackClock(active: boolean, onTick: (elapsedSeconds: number) => void): void {
  const tickCallback = useRef(onTick);
  tickCallback.current = onTick;

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let previousNow = performance.now();
    const tick = (now: number) => {
      const elapsedSeconds = Math.max(0, (now - previousNow) / 1_000);
      previousNow = now;
      tickCallback.current(elapsedSeconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

/** Editor-only clock. The rendered frame itself remains controlled by local scene time. */
export function useLoopingSceneTime(active: boolean, durationSeconds: number, resetKey: number): number {
  const [localTimeSeconds, setLocalTimeSeconds] = useState(0);

  useEffect(() => {
    setLocalTimeSeconds(0);
  }, [durationSeconds, resetKey]);

  usePlaybackClock(active && durationSeconds > 0, (elapsedSeconds) => {
    setLocalTimeSeconds((current) => (current + elapsedSeconds) % durationSeconds);
  });

  return localTimeSeconds;
}
