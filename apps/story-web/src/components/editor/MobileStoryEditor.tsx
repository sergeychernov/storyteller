import { useState } from "react";
import { classNames } from "../../class-names.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./MobileStoryEditor.module.css";
import type { StoryEditorViewProps } from "./story-editor-view.js";
import { SceneCarousel } from "./SceneCarousel.js";
import { SceneEditorHeader, type MobileEditorMode } from "./SceneEditorHeader.js";
import { SceneEditorTabs } from "./SceneEditorTabs.js";
import type { EditorTab } from "./SceneEditorTabs.js";
import { SceneRail } from "./SceneRail.js";
import { useSceneTitleEditor } from "./use-scene-title-editor.js";

export function MobileStoryEditor(props: StoryEditorViewProps) {
  const [mode, setMode] = useState<MobileEditorMode>("scene");
  const [activeTab, setActiveTab] = useState<EditorTab>("materials");
  const { selected } = props;

  if (!selected) return <MobileEmptyStoryEditor {...props} mode={mode} onModeChange={setMode} />;
  return <MobileSelectedStoryEditor
    {...props}
    selected={selected}
    mode={mode}
    onModeChange={setMode}
    activeTab={activeTab}
    onActiveTabChange={setActiveTab}
  />;
}

function MobileSelectedStoryEditor(props: StoryEditorViewProps & {
  readonly selected: NonNullable<StoryEditorViewProps["selected"]>;
  readonly mode: MobileEditorMode;
  readonly onModeChange: (mode: MobileEditorMode) => void;
  readonly activeTab: EditorTab;
  readonly onActiveTabChange: (tab: EditorTab) => void;
}) {
  const {
    story, session, selected, copy, saving, adding, uploading, backgroundUploading, uploadCount, operationErrorMessage, deleteDisabled,
    timeline, timelineLoading, timelineError, onRetryTimeline, mode, onModeChange, activeTab, onActiveTabChange,
    onSelect, onAdd, onUpload, onUploadBackground, onRemoveBackground, onDeleteMaterial, onMoveMaterial, onEditMaterial, onReorder, onReorderScenes, onChange, onDeleteScene, onSetTitle,
  } = props;
  const titleEditor = useSceneTitleEditor(selected, saving, onSetTitle);
  const selectTab = (tab: EditorTab) => {
    if (activeTab === "titles" && tab !== activeTab) void titleEditor.saveText().catch(() => undefined);
    onActiveTabChange(tab);
  };

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
        onModeChange={onModeChange}
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
          title={titleEditor.title}
          titleEditing={activeTab === "titles"}
          onCommitTitlePosition={(position) => {
            const title = titleEditor.title;
            if (!title) return;
            const changed = { ...title, position };
            titleEditor.preview(changed);
            void titleEditor.save(changed, "position").catch(() => undefined);
          }}
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
        activeTab={activeTab}
        onActiveTabChange={selectTab}
        titleEditor={titleEditor}
      />}
    </div>
  );
}

function MobileEmptyStoryEditor({ story, copy, saving, adding, operationErrorMessage, session, timeline, timelineLoading, timelineError, onRetryTimeline, onAdd, onSelect, onReorderScenes, mode, onModeChange }: StoryEditorViewProps & {
  readonly mode: MobileEditorMode; readonly onModeChange: (mode: MobileEditorMode) => void;
}) {
  return <div className={styles.editor}>
    <SceneEditorHeader storyTitle={story.title} storyId={story.id} scenes={story.scenes} selectedId="" copy={copy} saving={saving}
      mode={mode} onModeChange={onModeChange} />
    {operationErrorMessage && <div className={classNames(sharedStyles.operationError, styles.operationError)} role="alert">{operationErrorMessage}</div>}
    <div className={classNames(styles.stage, mode === "timeline" && styles.timelineStage)}>
      {mode === "scene" ? <SceneCarousel scenes={story.scenes} selectedId="" copy={copy} storyId={story.id} session={session}
        adding={adding} saving={saving} deleteDisabled onDeleteScene={() => undefined} onSelect={onSelect} onAdd={onAdd} onChange={() => undefined} />
        : <SceneRail scenes={story.scenes} storyId={story.id} session={session} selectedId="" copy={copy} adding={adding} saving={saving}
          onSelect={onSelect} onAdd={onAdd} onReorder={onReorderScenes} timeline={timeline} timelineLoading={timelineLoading}
          timelineError={timelineError} onRetryTimeline={onRetryTimeline} variant="mobileTimeline" />}
    </div>
  </div>;
}
