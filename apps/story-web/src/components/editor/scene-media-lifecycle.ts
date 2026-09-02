export interface SceneMediaLifecycle {
  readonly prepare: (localTimeSeconds: number) => Promise<void>;
  readonly play: (localTimeSeconds: number) => Promise<void>;
  readonly pause: () => void;
  readonly seek: (localTimeSeconds: number) => void;
  readonly dispose: () => void;
}

/** One clock owner for native media; all correction uses the same 80 ms drift budget. */
export function createSceneMediaLifecycle(
  media: HTMLMediaElement,
  sourceTime: (localTimeSeconds: number) => number,
): SceneMediaLifecycle {
  let disposed = false;
  let wantsPlayback = false;
  let pendingPlay: Promise<void> | undefined;
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
      wantsPlayback = true;
      seek(localTimeSeconds);
      if (!media.paused) return;
      pendingPlay ??= media.play()
        .then(() => {
          if (!wantsPlayback || disposed) media.pause();
        })
        .catch((error: unknown) => {
          // pause(), load() and source replacement reject an outstanding play()
          // with AbortError. That is lifecycle cancellation, not media failure.
          if (!wantsPlayback || disposed || isPlayInterruption(error)) return;
          throw error;
        })
        .finally(() => {
          pendingPlay = undefined;
        });
      await pendingPlay;
    },
    pause() {
      wantsPlayback = false;
      if (!disposed && !media.paused) media.pause();
    },
    seek,
    dispose() {
      if (disposed) return;
      disposed = true;
      wantsPlayback = false;
      for (const cleanup of pendingCleanups) cleanup();
      media.pause();
      media.removeAttribute("src");
      media.load();
    },
  };
}

function isPlayInterruption(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && "name" in error && (error as { readonly name?: unknown }).name === "AbortError";
}
