import { classNames } from "../../class-names.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./MobileStoryEditor.module.css";
import type { StoryEditorViewProps } from "./story-editor-view.js";
import { SceneCarousel } from "./SceneCarousel.js";
import { SceneEditorHeader } from "./SceneEditorHeader.js";
import { SceneEditorTabs } from "./SceneEditorTabs.js";

export function MobileStoryEditor(props: StoryEditorViewProps) {
  const {
    story, session, selected, copy, saving, adding, uploading, uploadCount, operationErrorMessage,
    onSelect, onAdd, onUpload, onDeleteMaterial, onEditMaterial, onReorder, onChange,
  } = props;

  return (
    <div className={styles.editor}>
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
      {operationErrorMessage && <div className={classNames(sharedStyles.operationError, styles.operationError)} role="alert">{operationErrorMessage}</div>}
      <div className={styles.stage}>
        <SceneCarousel
          scenes={story.scenes}
          selectedId={selected?.id ?? ""}
          copy={copy}
          storyId={story.id}
          session={session}
          adding={adding}
          saving={saving}
          onSelect={onSelect}
          onAdd={onAdd}
          onChange={onChange}
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
        onDeleteMaterial={onDeleteMaterial}
        onEditMaterial={onEditMaterial}
        onReorder={onReorder}
        onChange={onChange}
      />}
    </div>
  );
}
