import { useMutation, useQueryClient } from "@tanstack/react-query";
import { analytics, type MaterialKind } from "@storyteller/analytics";
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
import { getEditorCopy, getEditorOperationError, getMaterialMoveError, getSceneOrderError } from "./editor-copy.js";
import type { SceneChange, StoryEditorViewProps } from "./story-editor-view.js";
import { useReorderSceneMaterials } from "./use-reorder-scene-materials.js";
import { useReorderStoryScenes } from "./use-reorder-story-scenes.js";
import { useMoveSceneMaterial } from "./use-move-scene-material.js";
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
      analytics.track("scene created", {});
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
        analytics.track("material uploaded", { material_kind: materialKind(file) });
        update(changed);
      }
      if (!changed) throw new Error("at least one media file is required");
      return changed;
    },
    onSuccess: update,
  });
  const reorderMutation = useReorderSceneMaterials(session.accessToken, story.id);
  const reorderScenesMutation = useReorderStoryScenes(session.accessToken, story.id);
  const moveMaterialMutation = useMoveSceneMaterial(session.accessToken, story.id);
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
    || editMaterialMutation.isPending || reorderMutation.isPending || reorderScenesMutation.isPending
    || moveMaterialMutation.isPending || configureMutation.isPending;
  const deletion = useDeleteScene({ story, session, selectedId, onSelect, copy, saving });
  const operationError = addSceneMutation.error ?? uploadMaterialsMutation.error ?? deleteMaterialMutation.error
    ?? editMaterialMutation.error ?? reorderMutation.error ?? reorderScenesMutation.error ?? moveMaterialMutation.error
    ?? configureMutation.error;

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
      ? addSceneMutation.isError ? copy.sceneCreateError
        : reorderScenesMutation.isError ? getSceneOrderError(copy, operationError)
          : moveMaterialMutation.isError ? getMaterialMoveError(copy, operationError)
          : getEditorOperationError(copy, operationError)
      : undefined,
    onSelect: (id) => { if (!deletion.target && !deletion.pending) onSelect(id); },
    onAdd: addScene,
    onDeleteScene: deletion.open,
    onReorderScenes: (ids) => {
      if (!saving && !deletion.target && !deletion.pending && (story.status === "draft" || story.status === "ready")) {
        reorderScenesMutation.reset();
        reorderScenesMutation.mutate({ ids, expectedRevision: story.revision });
      }
    },
    onUpload: (files) => {
      if (selected && !deletion.target && !deletion.pending) uploadMaterialsMutation.mutate({ sceneId: selected.id, files });
    },
    onDeleteMaterial: (materialId) => {
      if (selected && !deletion.target && !deletion.pending) deleteMaterialMutation.mutate({ sceneId: selected.id, materialId });
    },
    onMoveMaterial: (sourceSceneId, materialId, targetSceneId) => {
      const source = story.scenes.find(({ id }) => id === sourceSceneId);
      const target = story.scenes.find(({ id }) => id === targetSceneId);
      if (!source?.materials.some(({ id }) => id === materialId) || !target || sourceSceneId === targetSceneId
        || saving || deletion.target || deletion.pending || (story.status !== "draft" && story.status !== "ready")) return;
      moveMaterialMutation.reset();
      moveMaterialMutation.mutate({
        sourceSceneId,
        materialId,
        targetSceneId,
        targetIndex: target.materials.length,
        expectedRevision: story.revision,
      }, { onSuccess: () => onSelect(targetSceneId) });
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

function materialKind(file: File): MaterialKind {
  return file.type.startsWith("video/") ? "video" : "image";
}
