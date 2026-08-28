import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  configureStoryScene,
  createScene,
  deleteSceneMaterial,
  editSceneMaterial,
  uploadSceneMaterial,
  type AuthSession,
  type MaterialEdit,
  type Story,
} from "../../api.js";
import { useLocalization } from "../../localization.js";
import { getEditorCopy, getEditorOperationError } from "./editor-copy.js";
import type { SceneChange, StoryEditorViewProps } from "./story-editor-view.js";
import { useReorderSceneMaterials } from "./use-reorder-scene-materials.js";
import { useDeleteScene, type SceneDeletionController } from "./use-delete-scene.js";

interface UseStoryEditorArgs {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function useStoryEditor({ story, session, selectedId, onSelect }: UseStoryEditorArgs): {
  view: StoryEditorViewProps; deletion: SceneDeletionController;
} {
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
  const deleteMaterialMutation = useMutation({
    mutationFn: ({ sceneId, materialId }: { sceneId: string; materialId: string }) => deleteSceneMaterial(
      session.accessToken, story.id, sceneId, materialId,
    ),
    onSuccess: update,
  });
  const editMaterialMutation = useMutation({
    mutationFn: ({ sceneId, materialId, edit }: {
      sceneId: string; materialId: string; edit: MaterialEdit;
    }) => editSceneMaterial(session.accessToken, story.id, sceneId, materialId, edit),
    onSuccess: update,
  });
  const configureMutation = useMutation({
    mutationFn: ({ sceneId, change }: { sceneId: string; change: SceneChange }) => configureStoryScene(session.accessToken, story.id, sceneId, change),
    onSuccess: update,
  });
  const selected = story.scenes.find(({ id }) => id === selectedId) ?? story.scenes[0];
  const saving = addSceneMutation.isPending || uploadMaterialsMutation.isPending || deleteMaterialMutation.isPending
    || editMaterialMutation.isPending || reorderMutation.isPending || configureMutation.isPending;
  const deletion = useDeleteScene({ story, session, selectedId, onSelect, copy, saving });
  const operationError = addSceneMutation.error ?? uploadMaterialsMutation.error ?? deleteMaterialMutation.error
    ?? editMaterialMutation.error ?? reorderMutation.error ?? configureMutation.error;

  function addScene() {
    if (deletion.target || deletion.pending) return;
    addSceneMutation.reset();
    addSceneMutation.mutate();
  }

  return { deletion, view: {
    story,
    session,
    selected,
    copy,
    saving: saving || deletion.pending,
    deleteDisabled: saving || deletion.pending || (story.status !== "draft" && story.status !== "ready"),
    adding: addSceneMutation.isPending,
    uploading: uploadMaterialsMutation.isPending,
    uploadCount: uploadMaterialsMutation.variables?.files.length ?? 0,
    operationErrorMessage: operationError
      ? addSceneMutation.isError ? copy.sceneCreateError : getEditorOperationError(copy, operationError)
      : undefined,
    onSelect: (id) => { if (!deletion.target && !deletion.pending) onSelect(id); },
    onAdd: addScene,
    onDeleteScene: deletion.open,
    onUpload: (files) => {
      if (selected && !deletion.target && !deletion.pending) uploadMaterialsMutation.mutate({ sceneId: selected.id, files });
    },
    onDeleteMaterial: (materialId) => {
      if (selected && !deletion.target && !deletion.pending) deleteMaterialMutation.mutate({ sceneId: selected.id, materialId });
    },
    onEditMaterial: async (materialId, edit) => {
      if (!selected || deletion.target || deletion.pending) return;
      await editMaterialMutation.mutateAsync({ sceneId: selected.id, materialId, edit });
    },
    onReorder: (ids) => {
      if (selected && !deletion.target && !deletion.pending) reorderMutation.mutate({ sceneId: selected.id, ids });
    },
    onChange: (change) => {
      if (selected && !deletion.target && !deletion.pending) configureMutation.mutate({ sceneId: selected.id, change });
    },
  } };
}
