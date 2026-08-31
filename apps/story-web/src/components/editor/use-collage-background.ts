import { useMutation } from "@tanstack/react-query";
import { analytics } from "@storyteller/analytics";
import {
  removeCollageBackgroundMaterial, uploadCollageBackgroundMaterial, type Story,
} from "../../api.js";

export type CollageBackgroundAction =
  | { readonly kind: "upload"; readonly file: File }
  | { readonly kind: "remove" };

export function useCollageBackground(
  accessToken: string,
  storyId: string,
  onStoryChange: (story: Story) => void,
) {
  return useMutation({
    mutationFn: ({ sceneId, action }: { readonly sceneId: string; readonly action: CollageBackgroundAction }) =>
      action.kind === "upload"
        ? uploadCollageBackgroundMaterial(accessToken, storyId, sceneId, action.file)
        : removeCollageBackgroundMaterial(accessToken, storyId, sceneId),
    onSuccess: (changed, variables) => {
      if (variables.action.kind === "upload") {
        analytics.track("material uploaded", {
          material_kind: variables.action.file.type.startsWith("video/") ? "video" : "image",
        });
        analytics.track("collage background configured", { collage_background_mode: "custom_material_original" });
      } else {
        analytics.track("collage background configured", { collage_background_mode: "previous_scene_darkened" });
      }
      onStoryChange(changed);
    },
  });
}
