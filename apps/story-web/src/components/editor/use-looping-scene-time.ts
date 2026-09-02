import { useEffect, useState } from "react";

/** Editor-only clock. The rendered frame itself remains controlled by local scene time. */
export function useLoopingSceneTime(active: boolean, durationSeconds: number, resetKey: number): number {
  const [localTimeSeconds, setLocalTimeSeconds] = useState(0);

  useEffect(() => {
    setLocalTimeSeconds(0);
    if (!active || durationSeconds <= 0) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsedSeconds = Math.max(0, (now - startedAt) / 1_000);
      setLocalTimeSeconds(Math.min(durationSeconds, elapsedSeconds));
      if (elapsedSeconds < durationSeconds) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, durationSeconds, resetKey]);

  return localTimeSeconds;
}
