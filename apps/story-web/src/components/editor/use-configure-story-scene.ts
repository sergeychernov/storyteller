import { useMutation, useQueryClient } from "@tanstack/react-query";
import { analytics } from "@storyteller/analytics";
import { configureStoryScene, type Story } from "../../api.js";
import type { SceneChange } from "./story-editor-view.js";

export function useConfigureStoryScene(csrfToken: string, storyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["story", storyId] as const;
  return useMutation({
    mutationKey: ["configure-story-scene", storyId],
    // Native slider/color events may arrive back-to-back. Story writes are revisioned,
    // so configuration requests for one story must run in their original order.
    scope: { id: `configure-story-scene:${storyId}` },
    mutationFn: ({ sceneId, change }: { readonly sceneId: string; readonly change: SceneChange }) => {
      const { outcome: _outcome, ...configuration } = change;
      return configureStoryScene(csrfToken, storyId, sceneId, configuration);
    },
    onSuccess: (changed: Story, { change }) => {
      queryClient.setQueryData(queryKey, changed);
      const rowDirection = change.outcome?.collageRowDirectionConfigured;
      if (rowDirection) analytics.track("collage row direction configured", { collage_row_direction: rowDirection });
    },
  });
}
