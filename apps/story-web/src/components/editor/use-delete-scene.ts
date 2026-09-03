import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { deleteScene, getStory, type AuthSession, type Story } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { deleteSceneWithRecovery, newestStory, selectSceneAfterDeletion, type SceneDeletionTarget } from "./scene-deletion-model.js";

export function useDeleteScene({ story, session, selectedId, onSelect, copy, saving }: {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly copy: EditorCopy;
  readonly saving: boolean;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<SceneDeletionTarget>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const selection = useRef(selectedId);
  selection.current = selectedId;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const queryKey = ["story", story.id] as const;
  const mutation = useMutation({
    retry: false,
    mutationFn: ({ target, checkOnly }: { target: SceneDeletionTarget; checkOnly: boolean }) => deleteSceneWithRecovery(target, {
      remove: (sceneId, revision) => deleteScene(session.csrfToken, story.id, sceneId, revision),
      read: () => getStory(session.csrfToken, story.id),
    }, checkOnly),
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSuccess: async (result, { target }) => {
      if (result.story) {
        await queryClient.cancelQueries({ queryKey });
        const changed = newestStory(queryClient.getQueryData<Story>(queryKey), result.story);
        queryClient.setQueryData(queryKey, changed);
        if (mounted.current) onSelect(selectSceneAfterDeletion(target.story, changed, selection.current, target.sceneId));
        void queryClient.invalidateQueries({ queryKey: ["stories", session.profile.id] });
      }
      if (result.status === "deleted" && mounted.current) setTarget(undefined);
    },
    onSettled: () => { inFlight.current = false; },
  });

  return {
    target,
    pending: mutation.isPending,
    result: mutation.data,
    failed: mutation.isError,
    open: (sceneId: string) => {
      if (saving || inFlight.current || target || (story.status !== "draft" && story.status !== "ready")) return;
      const index = story.scenes.findIndex(({ id }) => id === sceneId);
      const scene = story.scenes[index];
      if (!scene) return;
      mutation.reset();
      setTarget({ sceneId, name: scene.title?.text || `${copy.scene} ${index + 1}`, story });
    },
    close: () => { if (!inFlight.current) setTarget(undefined); },
    confirm: () => {
      if (!target || saving || inFlight.current || mutation.data?.status === "changed" || mutation.data?.status === "blocked") return;
      inFlight.current = true;
      mutation.mutate({ target, checkOnly: mutation.data?.status === "unverified" || mutation.isError });
    },
  };
}

export type SceneDeletionController = ReturnType<typeof useDeleteScene>;
