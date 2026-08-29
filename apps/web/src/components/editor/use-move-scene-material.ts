import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moveSceneMaterials, type Story } from "../../api.js";
import { moveMaterialBetweenScenes } from "./material-scene-move-model.js";

interface MoveSceneMaterialVariables {
  readonly sourceSceneId: string;
  readonly materialId: string;
  readonly targetSceneId: string;
  readonly targetIndex: number;
  readonly expectedRevision: number;
}

export function useMoveSceneMaterial(accessToken: string, storyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["story", storyId] as const;

  return useMutation({
    mutationFn: ({ sourceSceneId, materialId, targetSceneId, targetIndex, expectedRevision }: MoveSceneMaterialVariables) => (
      moveSceneMaterials(accessToken, storyId, sourceSceneId, {
        materialIds: [materialId], targetSceneId, targetIndex, expectedRevision,
      })
    ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Story>(queryKey);
      if (previous?.revision === variables.expectedRevision) queryClient.setQueryData(queryKey, {
        ...previous,
        scenes: moveMaterialBetweenScenes(
          previous.scenes,
          variables.sourceSceneId,
          variables.materialId,
          variables.targetSceneId,
          variables.targetIndex,
        ),
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (changed) => queryClient.setQueryData(queryKey, changed),
  });
}
