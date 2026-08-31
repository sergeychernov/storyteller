import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderStoryScenes, type Story } from "../../api.js";

export function useReorderStoryScenes(csrfToken: string, storyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["story", storyId] as const;

  return useMutation({
    mutationFn: ({ ids, expectedRevision }: { ids: readonly string[]; expectedRevision: number }) => (
      reorderStoryScenes(csrfToken, storyId, ids, expectedRevision)
    ),
    onMutate: async ({ ids, expectedRevision }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Story>(queryKey);
      if (previous?.revision === expectedRevision) queryClient.setQueryData(queryKey, reorderImmediately(previous, ids));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (changed) => queryClient.setQueryData(queryKey, changed),
  });
}

function reorderImmediately(story: Story, ids: readonly string[]): Story {
  const byId = new Map(story.scenes.map((scene) => [scene.id, scene]));
  const scenes = ids.map((id) => byId.get(id)).filter((scene) => scene !== undefined);
  return scenes.length === story.scenes.length ? { ...story, scenes } : story;
}
