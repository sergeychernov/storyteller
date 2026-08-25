import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  configureStoryScene, createScene, uploadSceneMaterial,
  type AuthSession, type SceneMotion, type Story,
} from "../../api.js";
import { useLocalization } from "../../localization.js";
import { getEditorCopy, getEditorOperationError } from "./editor-copy.js";
import { EmptyScenePipeline } from "./EmptyScenePipeline.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneInspector } from "./SceneInspector.js";
import { ScenePreview } from "./ScenePreview.js";
import { SceneRail } from "./SceneRail.js";
import { useReorderSceneMaterials } from "./use-reorder-scene-materials.js";

export function StoryEditor({ story, session }: { readonly story: Story; readonly session: AuthSession }) {
  const { locale } = useLocalization();
  const copy = getEditorCopy(locale);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(story.scenes[0]?.id ?? "");
  const update = (changed: Story) => queryClient.setQueryData(["story", story.id], changed);
  const addSceneMutation = useMutation({ mutationFn: () => createScene(session.accessToken, story.id), onSuccess: (changed) => { update(changed); setSelectedId(changed.scenes.at(-1)!.id); } });
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
  const operationError = uploadMaterialsMutation.error ?? reorderMutation.error ?? configureMutation.error;

  function addFirstScene() {
    addSceneMutation.reset();
    addSceneMutation.mutate();
  }

  useEffect(() => { if (!selectedId && story.scenes[0]) setSelectedId(story.scenes[0].id); }, [selectedId, story.scenes]);

  if (!selected) return <EmptyScenePipeline copy={copy} creating={addSceneMutation.isPending} error={addSceneMutation.isError} onCreate={addFirstScene} />;
  return (
    <div className="story-editor">
      {operationError && <div className="editor-operation-error" role="alert">{getEditorOperationError(copy, operationError)}</div>}
      <SceneRail scenes={story.scenes} selectedId={selected.id} copy={copy} onSelect={setSelectedId} onAdd={() => addSceneMutation.mutate()} adding={addSceneMutation.isPending} />
      <main className="editor-workspace">
        <ScenePreview scene={selected} copy={copy} storyId={story.id} session={session} />
        <MaterialTimeline
          scene={selected} copy={copy} saving={saving} storyId={story.id} session={session}
          uploading={uploadMaterialsMutation.isPending}
          uploadCount={uploadMaterialsMutation.variables?.files.length ?? 0}
          onUpload={(files) => uploadMaterialsMutation.mutate({ sceneId: selected.id, files })}
          onReorder={(ids) => reorderMutation.mutate({ sceneId: selected.id, ids })}
        />
      </main>
      <SceneInspector scene={selected} copy={copy} saving={saving} onChange={(change) => configureMutation.mutate({ sceneId: selected.id, change })} />
    </div>
  );
}
