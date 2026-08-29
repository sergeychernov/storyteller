import { useState } from "react";
import { classNames } from "../../class-names.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./MobileStoryEditor.module.css";
import type { StoryEditorViewProps } from "./story-editor-view.js";
import { SceneCarousel } from "./SceneCarousel.js";
import { SceneEditorHeader, type MobileEditorMode } from "./SceneEditorHeader.js";
import { SceneEditorTabs } from "./SceneEditorTabs.js";
import { SceneRail } from "./SceneRail.js";

export function MobileStoryEditor(props: StoryEditorViewProps) {
  const [mode, setMode] = useState<MobileEditorMode>("scene");
  const {
    story, session, selected, copy, saving, adding, uploading, uploadCount, operationErrorMessage, deleteDisabled,
    onSelect, onAdd, onUpload, onDeleteMaterial, onMoveMaterial, onEditMaterial, onReorder, onReorderScenes, onChange, onDeleteScene,
  } = props;

  return (
    <div className={styles.editor}>
      <SceneEditorHeader
        storyTitle={story.title}
        scenes={story.scenes}
        selectedId={selected?.id ?? ""}
        copy={copy}
        saving={saving}
        mode={mode}
        onModeChange={setMode}
      />
      {operationErrorMessage && <div className={classNames(sharedStyles.operationError, styles.operationError)} role="alert">{operationErrorMessage}</div>}
      <div className={classNames(styles.stage, mode === "timeline" && styles.timelineStage)}>
        {mode === "scene" ? <SceneCarousel
          scenes={story.scenes}
          selectedId={selected?.id ?? ""}
          copy={copy}
          storyId={story.id}
          session={session}
          adding={adding}
          saving={saving}
          deleteDisabled={deleteDisabled}
          onDeleteScene={onDeleteScene}
          onSelect={onSelect}
          onAdd={onAdd}
          onChange={onChange}
        /> : <SceneRail
          scenes={story.scenes}
          storyId={story.id}
          session={session}
          selectedId={selected?.id ?? ""}
          copy={copy}
          adding={adding}
          saving={saving}
          onSelect={onSelect}
          onAdd={onAdd}
          onReorder={onReorderScenes}
          variant="mobileTimeline"
        />}
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
        onMoveMaterial={onMoveMaterial}
        onEditMaterial={onEditMaterial}
        onReorder={onReorder}
        onChange={onChange}
      />}
    </div>
  );
}
