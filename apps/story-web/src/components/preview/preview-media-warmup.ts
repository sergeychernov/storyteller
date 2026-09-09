/** Warm browser media buffers without starting playback. The caller owns and releases every native resource. */
export function warmPreviewMedia(url: string, kind: "image" | "video" | "audio", start: number, settled: () => void): () => void {
  let done = false;
  let disposed = false;
  const element = kind === "image" ? new Image() : document.createElement(kind);
  const finish = () => { if (!done && !disposed) { done = true; clearTimeout(timeout); settled(); } };
  const release = () => {
    disposed = true;
    clearTimeout(timeout);
    element.onload = null;
    element.onerror = null;
    if (element instanceof HTMLMediaElement) {
      element.onloadedmetadata = null; element.oncanplay = null; element.onprogress = null; element.onseeked = null;
      element.pause(); element.removeAttribute("src"); element.load();
    } else element.removeAttribute("src");
  };
  const timeout = setTimeout(() => { finish(); release(); }, 15_000);
  element.onerror = () => { finish(); release(); };
  if (element instanceof HTMLMediaElement) {
    element.muted = true;
    element.preload = "auto";
    const check = () => {
      if (element.seeking || element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
      const target = Math.min(start + 3, element.duration);
      for (let i = 0; i < element.buffered.length; i++) {
        if (element.buffered.start(i) <= start + 0.05 && element.buffered.end(i) >= target - 0.05) finish();
      }
    };
    element.onloadedmetadata = () => { element.currentTime = Math.min(start, element.duration); check(); };
    element.oncanplay = check;
    element.onseeked = check;
    element.onprogress = check;
    element.src = url;
    element.load();
  } else {
    element.onload = () => { void element.decode().then(finish).catch(() => { finish(); release(); }); };
    element.src = url;
  }
  return release;
}
