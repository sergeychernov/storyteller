import type { StoryEditorViewProps } from "./story-editor-view.js";
import { SceneCarousel } from "./SceneCarousel.js";
import { SceneEditorHeader } from "./SceneEditorHeader.js";
import { SceneEditorTabs } from "./SceneEditorTabs.js";

export function MobileStoryEditor(props: StoryEditorViewProps) {
  const { story, session, selected, copy, saving, adding, uploading, uploadCount, operationErrorMessage, onSelect, onAdd, onUpload, onReorder, onChange } = props;

  return (
    <div className="focus-story-editor">
      <SceneEditorHeader
        storyTitle={story.title}
        scenes={story.scenes}
        selectedId={selected?.id ?? ""}
        copy={copy}
        saving={saving}
        adding={adding}
        onSelect={onSelect}
        onAdd={onAdd}
      />
      {operationErrorMessage && <div className="editor-operation-error focus-editor-error" role="alert">{operationErrorMessage}</div>}
      <div className="focus-editor-stage">
        <SceneCarousel
          scenes={story.scenes}
          selectedId={selected?.id ?? ""}
          copy={copy}
          storyId={story.id}
          session={session}
          adding={adding}
          onSelect={onSelect}
          onAdd={onAdd}
        />
      </div>
      {selected && <SceneEditorTabs
        scene={selected}
        copy={copy}
        saving={saving}
        storyId={story.id}
        session={session}
        uploading={uploading}
        uploadCount={uploadCount}
        onUpload={onUpload}
        onReorder={onReorder}
        onChange={onChange}
      />}
    </div>
  );
}
