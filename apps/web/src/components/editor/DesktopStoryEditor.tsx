import type { StoryEditorViewProps } from "./story-editor-view.js";
import { DesktopEditorHeader } from "./DesktopEditorHeader.js";
import { DesktopSceneInspector } from "./DesktopSceneInspector.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneEdgeActions } from "./SceneEdgeActions.js";
import { ScenePreview } from "./ScenePreview.js";
import { SceneRail } from "./SceneRail.js";

interface DesktopStoryEditorProps extends StoryEditorViewProps {
  readonly compact: boolean;
}

export function DesktopStoryEditor(props: DesktopStoryEditorProps) {
  const { story, session, selected, copy, saving, adding, uploading, uploadCount, operationErrorMessage, onSelect, onAdd, onUpload, onReorder, onChange } = props;

  return (
    <div className={`desktop-story-editor${props.compact ? " compact" : ""}`}>
      <DesktopEditorHeader storyTitle={story.title} scenes={story.scenes} selected={selected} copy={copy} saving={saving} />
      {operationErrorMessage && <div className="editor-operation-error desktop-editor-error" role="alert">{operationErrorMessage}</div>}
      <div className={`desktop-editor-body${props.compact ? " compact" : ""}${selected ? "" : " empty"}`}>
        <SceneRail scenes={story.scenes} selectedId={selected?.id ?? ""} copy={copy} adding={adding} onSelect={onSelect} onAdd={onAdd} />
        {selected ? <>
          <main className="desktop-editor-workspace">
            <ScenePreview scene={selected} copy={copy} storyId={story.id} session={session} />
            <section className="desktop-material-panel">
              <div className="desktop-material-heading">
                <h2>{copy.materials}</h2>
                <span>{selected.materials.length}</span>
              </div>
              <MaterialTimeline
                scene={selected}
                copy={copy}
                saving={saving}
                storyId={story.id}
                session={session}
                uploading={uploading}
                uploadCount={uploadCount}
                onUpload={onUpload}
                onReorder={onReorder}
              />
            </section>
          </main>
          <DesktopSceneInspector scene={selected} copy={copy} saving={saving} compact={props.compact} onChange={onChange} />
        </> : <main className="desktop-editor-empty">
          <SceneEdgeActions copy={copy} adding={adding} active onAdd={onAdd} />
        </main>}
      </div>
    </div>
  );
}
