import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  configureStoryScene, createScene, uploadSceneMaterial,
  type AuthSession, type SceneMotion, type Story,
} from "../../api.js";
import { useLocalization } from "../../localization.js";
import { getEditorCopy, getEditorOperationError } from "./editor-copy.js";
import { SceneCarousel } from "./SceneCarousel.js";
import { SceneEditorHeader } from "./SceneEditorHeader.js";
import { SceneEditorTabs } from "./SceneEditorTabs.js";
import { useReorderSceneMaterials } from "./use-reorder-scene-materials.js";

interface StoryEditorProps {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function StoryEditor({ story, session, selectedId, onSelect }: StoryEditorProps) {
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
  const configureMutation = useMutation({ mutationFn: ({ sceneId, change }: { sceneId: string; change: { durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion } }) => configureStoryScene(session.accessToken, story.id, sceneId, change), onSuccess: update });
  const selected = story.scenes.find(({ id }) => id === selectedId) ?? story.scenes[0];
  const saving = addSceneMutation.isPending || uploadMaterialsMutation.isPending || reorderMutation.isPending || configureMutation.isPending;
  const operationError = addSceneMutation.error ?? uploadMaterialsMutation.error ?? reorderMutation.error ?? configureMutation.error;

  function addScene() {
    addSceneMutation.reset();
    addSceneMutation.mutate();
  }

  return (
    <div className="focus-story-editor">
      <SceneEditorHeader
        storyTitle={story.title}
        scenes={story.scenes}
        selectedId={selected?.id ?? ""}
        copy={copy}
        saving={saving}
        adding={addSceneMutation.isPending}
        onSelect={onSelect}
        onAdd={addScene}
      />
      {operationError && <div className="editor-operation-error focus-editor-error" role="alert">
        {addSceneMutation.isError ? copy.sceneCreateError : getEditorOperationError(copy, operationError)}
      </div>}
      <div className="focus-editor-stage">
        <SceneCarousel
          scenes={story.scenes}
          selectedId={selected?.id ?? ""}
          copy={copy}
          storyId={story.id}
          session={session}
          adding={addSceneMutation.isPending}
          onSelect={onSelect}
          onAdd={addScene}
        />
      </div>
      {selected && <SceneEditorTabs
        scene={selected} copy={copy} saving={saving} storyId={story.id} session={session}
        uploading={uploadMaterialsMutation.isPending}
        uploadCount={uploadMaterialsMutation.variables?.files.length ?? 0}
        onUpload={(files) => uploadMaterialsMutation.mutate({ sceneId: selected.id, files })}
        onReorder={(ids) => reorderMutation.mutate({ sceneId: selected.id, ids })}
        onChange={(change) => configureMutation.mutate({ sceneId: selected.id, change })}
      />}
    </div>
  );
}
