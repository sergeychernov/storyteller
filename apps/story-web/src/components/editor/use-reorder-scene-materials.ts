import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderSceneMaterials, type Story } from "../../api.js";

export function useReorderSceneMaterials(accessToken: string, storyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["story", storyId] as const;

  return useMutation({
    mutationFn: ({ sceneId, ids }: { sceneId: string; ids: readonly string[] }) => reorderSceneMaterials(accessToken, storyId, sceneId, ids),
    onMutate: async ({ sceneId, ids }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Story>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, reorderImmediately(previous, sceneId, ids));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (changed) => queryClient.setQueryData(queryKey, changed),
  });
}

function reorderImmediately(story: Story, sceneId: string, ids: readonly string[]): Story {
  return {
    ...story,
    scenes: story.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const byId = new Map(scene.materials.map((material) => [material.id, material]));
      const materials = ids.map((id) => byId.get(id)).filter((material) => material !== undefined);
      return { ...scene, materials };
    }),
  };
}
