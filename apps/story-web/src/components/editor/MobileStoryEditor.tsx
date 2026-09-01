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
    story, session, selected, copy, saving, adding, uploading, backgroundUploading, uploadCount, operationErrorMessage, deleteDisabled,
    timeline, timelineLoading, timelineError, onRetryTimeline,
    onSelect, onAdd, onUpload, onUploadBackground, onRemoveBackground, onDeleteMaterial, onMoveMaterial, onEditMaterial, onReorder, onReorderScenes, onChange, onDeleteScene,
  } = props;

  return (
    <div className={styles.editor}>
      <SceneEditorHeader
        storyTitle={story.title}
        storyId={story.id}
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
          timeline={timeline}
          timelineLoading={timelineLoading}
          timelineError={timelineError}
          onRetryTimeline={onRetryTimeline}
          variant="mobileTimeline"
        />}
      </div>
      {selected && <SceneEditorTabs
        scene={selected}
        previousScene={story.scenes[story.scenes.findIndex(({ id }) => id === selected.id) - 1]}
        copy={copy}
        saving={saving}
        storyId={story.id}
        session={session}
        uploading={uploading}
        backgroundUploading={backgroundUploading}
        uploadCount={uploadCount}
        onUpload={onUpload}
        onUploadBackground={onUploadBackground}
        onRemoveBackground={onRemoveBackground}
        onDeleteMaterial={onDeleteMaterial}
        onMoveMaterial={onMoveMaterial}
        onEditMaterial={onEditMaterial}
        onReorder={onReorder}
        onChange={onChange}
      />}
    </div>
  );
}
