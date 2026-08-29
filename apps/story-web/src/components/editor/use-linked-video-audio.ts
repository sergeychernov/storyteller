import { useEffect, useRef, useState, type RefObject } from "react";

/** The video clock owns seeking, pauses, buffering and playback rate for both tracks. */
export function useLinkedVideoAudio(video: RefObject<HTMLVideoElement | null>, url: string | undefined, muted = false) {
  const audio = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const visual = video.current;
    const sound = audio.current;
    setFailed(false);
    if (!visual || !sound || !url) return;
    let disposed = false;
    function syncPosition() {
      if (muted) return;
      if (sound!.readyState > 0 && Math.abs(sound!.currentTime - visual!.currentTime) > 0.08) {
        sound!.currentTime = Math.min(visual!.currentTime, sound!.duration);
      }
      sound!.playbackRate = visual!.playbackRate;
    }
    function pause() { sound!.pause(); }
    function play() {
      if (muted) { pause(); return; }
      syncPosition();
      if (visual!.paused || visual!.seeking || visual!.ended) return;
      void sound!.play().then(() => { if (!disposed) setFailed(false); }).catch((error: unknown) => {
        if (!disposed && error instanceof Error && error.name !== "AbortError") setFailed(true);
      });
    }
    function seek() { pause(); syncPosition(); }
    const events = { playing: play, pause, ended: pause, waiting: pause, seeking: seek, seeked: play, timeupdate: syncPosition, ratechange: syncPosition };
    for (const [name, handler] of Object.entries(events)) visual.addEventListener(name, handler);
    sound.addEventListener("canplay", play);
    play();
    return () => {
      disposed = true;
      pause();
      for (const [name, handler] of Object.entries(events)) visual.removeEventListener(name, handler);
      sound.removeEventListener("canplay", play);
    };
  }, [video, url, muted]);
  useEffect(() => { if (audio.current) audio.current.muted = muted; }, [muted, url]);
  function resume() {
    const sound = audio.current;
    const visual = video.current;
    if (!sound || !visual || !url || visual.paused) return;
    sound.muted = false;
    if (sound.readyState > 0) sound.currentTime = Math.min(visual.currentTime, sound.duration);
    // Start in the user's click handler; browsers may forbid later audible autoplay.
    void sound.play().then(() => setFailed(false)).catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortError") setFailed(true);
    });
  }
  return { audio, failed, resume, onError: () => setFailed(true) };
}
