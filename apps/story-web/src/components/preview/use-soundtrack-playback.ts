import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SoundtrackMix } from "@storyteller/domain";
import { soundtrackAudioUrl, type SoundtrackRender } from "../../api.js";
import { createSoundtrackAudioContext, SoundtrackMixer, type SoundtrackAudioContext } from "./soundtrack-mixer.js";
import type { StoryPreviewSnapshot } from "./story-preview-machine.js";

const stemOrder = ["rhythm", "melody"] as const;
const syncToleranceSeconds = 0.25;

export function useSoundtrackPlayback(storyId: string, render: SoundtrackRender | undefined,
  snapshot: StoryPreviewSnapshot, mix: SoundtrackMix, sourceAudible: boolean) {
  const identity = render ? `${storyId}:${render.id}` : "";
  const [loaded, setLoaded] = useState({ identity: "", status: "idle" as "idle" | "loading" | "ready" | "error" });
  const status = loaded.identity === identity ? loaded.status : "idle";
  const mixer = useRef<SoundtrackMixer | undefined>(undefined);
  const context = useRef<SoundtrackAudioContext | undefined>(undefined);
  const requested = useRef(false);
  const playhead = useRef(snapshot.playheadSeconds);
  playhead.current = snapshot.playheadSeconds;
  const endedAt = useRef<number | undefined>(undefined);
  const unlocked = useRef(false);
  const settings = useRef({ render, mix, sourceAudible, identity, storyId });
  settings.current = { render, mix, sourceAudible, identity, storyId };
  const stems = stemOrder.filter((stem) => render?.stems?.includes(stem));
  const startLoading = useCallback(() => {
    const current = settings.current;
    if (mixer.current || !current.render || !requested.current || !unlocked.current || !context.current) return;
    endedAt.current = undefined;
    const instance = new SoundtrackMixer(context.current, () => { endedAt.current = playhead.current; });
    mixer.current = instance;
    for (const stem of stemOrder) instance.setLevel(stem, current.mix[stem]);
    instance.setDucking(current.sourceAudible, current.mix.duckedMelody, 0);
    setLoaded({ identity: current.identity, status: "loading" });
    const tracks = stemOrder.filter((stem) => current.render?.stems?.includes(stem));
    const loading = tracks.length ? instance.load(tracks.map((stem) => ({
      id: stem, url: soundtrackAudioUrl(current.storyId, current.render!.id, { stem }),
    }))) : Promise.reject(new Error("soundtrack has no playable stems"));
    void loading.then(() => {
      if (mixer.current === instance) setLoaded({ identity: current.identity, status: "ready" });
    }).catch(() => {
      if (mixer.current !== instance) return;
      instance.dispose(false);
      mixer.current = undefined;
      setLoaded({ identity: current.identity, status: "error" });
    });
  }, []);

  useEffect(() => {
    startLoading();
    return () => { mixer.current?.dispose(false); mixer.current = undefined; };
  }, [identity, startLoading]);
  useEffect(() => () => { void context.current?.close(); context.current = undefined; }, []);
  const retryKey = useRef(snapshot.retryKey);
  useEffect(() => {
    if (retryKey.current === snapshot.retryKey) return;
    retryKey.current = snapshot.retryKey;
    if (status === "error") startLoading();
  }, [snapshot.retryKey, startLoading, status]);

  const prepareFromGesture = useCallback(() => {
    requested.current = true;
    context.current ??= createSoundtrackAudioContext();
    const audio = context.current;
    if (!audio) return setLoaded({ identity: settings.current.identity, status: "error" });
    // Unlock audio in the gesture without starting any source before the common readiness barrier.
    void audio.resume().then(() => {
      if (context.current !== audio) return;
      unlocked.current = true;
      startLoading();
    }).catch(() => {
      if (context.current === audio) setLoaded({ identity: settings.current.identity, status: "error" });
    });
  }, [startLoading]);

  useLayoutEffect(() => {
    const instance = mixer.current;
    if (!instance || status !== "ready") return;
    // The audio clock can finish before the final animation frame. Only a backward seek or replay
    // may restart an ended track; another timeline tick must not replay its tail.
    if (endedAt.current !== undefined && snapshot.playheadSeconds < endedAt.current) endedAt.current = undefined;
    if (snapshot.status !== "playing") {
      instance.pause();
      instance.seek(snapshot.playheadSeconds);
    } else if (!instance.playing && endedAt.current === undefined) {
      void instance.play(snapshot.playheadSeconds).catch(() => setLoaded({ identity, status: "error" }));
    } else if (instance.playing && Math.abs(instance.position() - snapshot.playheadSeconds) > syncToleranceSeconds) {
      instance.seek(snapshot.playheadSeconds);
    }
  }, [identity, snapshot.status, snapshot.playheadSeconds, status]);
  useEffect(() => {
    for (const stem of stemOrder) mixer.current?.setLevel(stem, mix[stem]);
  }, [mix.melody, mix.rhythm, status]);
  useEffect(() => { mixer.current?.setDucking(sourceAudible, mix.duckedMelody); }, [mix.duckedMelody, sourceAudible, status]);
  return { status, stems, prepareFromGesture };
}
