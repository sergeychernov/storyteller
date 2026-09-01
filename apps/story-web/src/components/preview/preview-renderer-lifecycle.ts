export interface PreviewRendererLifecycle {
  readonly prepare: (localTimeSeconds: number) => Promise<void>;
  readonly play: (localTimeSeconds: number) => Promise<void>;
  readonly pause: () => void;
  readonly seek: (localTimeSeconds: number) => void;
  readonly dispose: () => void;
}

/** One clock owner for native media; all correction uses the same 80 ms drift budget. */
export function createMediaRendererLifecycle(
  media: HTMLMediaElement,
  sourceTime: (localTimeSeconds: number) => number,
): PreviewRendererLifecycle {
  let disposed = false;
  const pendingCleanups = new Set<() => void>();
  const seek = (localTimeSeconds: number) => {
    if (disposed) return;
    const target = sourceTime(localTimeSeconds);
    if (Number.isFinite(media.duration) && Math.abs(media.currentTime - target) > 0.08) media.currentTime = target;
  };
  return {
    async prepare(localTimeSeconds) {
      seek(localTimeSeconds);
      if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      await new Promise<void>((resolve, reject) => {
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("preview media failed to prepare")); };
        const cleanup = () => {
          media.removeEventListener("canplay", ready);
          media.removeEventListener("error", failed);
          pendingCleanups.delete(cleanup);
        };
        pendingCleanups.add(cleanup);
        media.addEventListener("canplay", ready, { once: true });
        media.addEventListener("error", failed, { once: true });
      });
    },
    async play(localTimeSeconds) {
      seek(localTimeSeconds);
      if (media.paused) await media.play();
    },
    pause() {
      if (!disposed && !media.paused) media.pause();
    },
    seek,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of pendingCleanups) cleanup();
      media.pause();
      media.removeAttribute("src");
      media.load();
    },
  };
}
