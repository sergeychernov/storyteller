import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  configureStoryScene,
  createScene,
  uploadSceneMaterial,
  type AuthSession,
  type Story,
} from "../../api.js";
import { useLocalization } from "../../localization.js";
import { getEditorCopy, getEditorOperationError } from "./editor-copy.js";
import type { SceneChange, StoryEditorViewProps } from "./story-editor-view.js";
import { useReorderSceneMaterials } from "./use-reorder-scene-materials.js";

interface UseStoryEditorArgs {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function useStoryEditor({ story, session, selectedId, onSelect }: UseStoryEditorArgs): StoryEditorViewProps {
  const { locale } = useLocalization();
  const copy = getEditorCopy(locale);
  const queryClient = useQueryClient();
  const update = (changed: Story) => queryClient.setQueryData(["story", story.id], changed);
  const addSceneMutation = useMutation({
    mutationFn: () => createScene(session.accessToken, story.id),
    onSuccess: (changed) => {
      update(changed);
      const created = changed.scenes.at(-1);
      if (created) onSelect(created.id);
    },
  });
  const uploadMaterialsMutation = useMutation({
    mutationFn: async ({ sceneId, files }: { sceneId: string; files: readonly File[] }) => {
      let changed: Story | undefined;
      for (const file of files) {
        changed = await uploadSceneMaterial(session.accessToken, story.id, sceneId, file);
        update(changed);
      }
      if (!changed) throw new Error("at least one media file is required");
      return changed;
    },
    onSuccess: update,
  });
  const reorderMutation = useReorderSceneMaterials(session.accessToken, story.id);
  const configureMutation = useMutation({
    mutationFn: ({ sceneId, change }: { sceneId: string; change: SceneChange }) => configureStoryScene(session.accessToken, story.id, sceneId, change),
    onSuccess: update,
  });
  const selected = story.scenes.find(({ id }) => id === selectedId) ?? story.scenes[0];
  const saving = addSceneMutation.isPending || uploadMaterialsMutation.isPending || reorderMutation.isPending || configureMutation.isPending;
  const operationError = addSceneMutation.error ?? uploadMaterialsMutation.error ?? reorderMutation.error ?? configureMutation.error;

  function addScene() {
    addSceneMutation.reset();
    addSceneMutation.mutate();
  }

  return {
    story,
    session,
    selected,
    copy,
    saving,
    adding: addSceneMutation.isPending,
    uploading: uploadMaterialsMutation.isPending,
    uploadCount: uploadMaterialsMutation.variables?.files.length ?? 0,
    operationErrorMessage: operationError
      ? addSceneMutation.isError ? copy.sceneCreateError : getEditorOperationError(copy, operationError)
      : undefined,
    onSelect,
    onAdd: addScene,
    onUpload: (files) => {
      if (selected) uploadMaterialsMutation.mutate({ sceneId: selected.id, files });
    },
    onReorder: (ids) => {
      if (selected) reorderMutation.mutate({ sceneId: selected.id, ids });
    },
    onChange: (change) => {
      if (selected) configureMutation.mutate({ sceneId: selected.id, change });
    },
  };
}
