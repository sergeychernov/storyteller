import { defaultSoundtrackMix, type SoundtrackMix } from "@storyteller/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { setStorySoundtrackMix, type AuthSession, type Story } from "../../api.js";

/** Levels react immediately and reach the server once the creator stops moving a fader. */
export const soundtrackMixSaveDelayMilliseconds = 600;

/**
 * Keeps the story playback levels editable without interrupting playback: the save leaves the story revision alone,
 * so the timeline query and the mounted preview survive every fader move.
 */
export function useSoundtrackMix(session: AuthSession, story: Story, delay = soundtrackMixSaveDelayMilliseconds) {
  const queryClient = useQueryClient();
  const [mix, setMix] = useState(() => story.soundtrackMix ?? defaultSoundtrackMix);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const save = useMutation({
    mutationFn: (next: SoundtrackMix) => setStorySoundtrackMix(session.csrfToken, story.id, story.revision, next),
    onSuccess: (updated) => {
      dirty.current = false;
      queryClient.setQueryData(["story", story.id], updated);
      // The master carries these levels, so a saved change makes an existing one stale.
      void queryClient.invalidateQueries({ queryKey: ["story-export", session.profile.id, story.id] });
    },
    onError: () => { dirty.current = false; },
  });
  const stored = story.soundtrackMix;

  useEffect(() => {
    if (!dirty.current) setMix(stored ?? defaultSoundtrackMix);
  }, [stored]);
  useEffect(() => () => clearTimeout(pending.current), []);

  const change = useCallback((channel: keyof SoundtrackMix, value: number) => {
    dirty.current = true;
    setMix((current) => {
      const next = { ...current, [channel]: Math.round(Math.max(0, Math.min(1, value)) * 100) / 100 };
      clearTimeout(pending.current);
      pending.current = setTimeout(() => save.mutate(next), delay);
      return next;
    });
  }, [delay, save]);

  return { mix, change, failed: save.isError };
}
