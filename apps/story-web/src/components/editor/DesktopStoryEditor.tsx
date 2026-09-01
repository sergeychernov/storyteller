import { classNames } from "../../class-names.js";
import sharedStyles from "./editor-shared.module.css";
import type { StoryEditorViewProps } from "./story-editor-view.js";
import { DesktopEditorHeader } from "./DesktopEditorHeader.js";
import { DesktopSceneInspector } from "./DesktopSceneInspector.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneEdgeActions } from "./SceneEdgeActions.js";
import { ScenePreview } from "./ScenePreview.js";
import { SceneRail } from "./SceneRail.js";
import { isSingleVideoScene } from "./scene-renderer-model.js";
import styles from "./DesktopStoryEditor.module.css";

interface DesktopStoryEditorProps extends StoryEditorViewProps {
  readonly compact: boolean;
}

export function DesktopStoryEditor(props: DesktopStoryEditorProps) {
  const {
    story, session, selected, copy, saving, adding, uploading, backgroundUploading, uploadCount, operationErrorMessage, deleteDisabled,
    timeline, timelineLoading, timelineError, onRetryTimeline,
    onSelect, onAdd, onUpload, onUploadBackground, onRemoveBackground, onDeleteMaterial, onMoveMaterial, onEditMaterial, onReorder, onReorderScenes, onChange, onDeleteScene,
  } = props;
  const showInspector = !!selected && !isSingleVideoScene(selected);

  return (
    <div className={styles.editor}>
      <DesktopEditorHeader storyTitle={story.title} storyId={story.id} scenes={story.scenes} selected={selected} copy={copy} saving={saving} compact={props.compact} />
      {operationErrorMessage && <div className={classNames(sharedStyles.operationError, styles.operationError)} role="alert">{operationErrorMessage}</div>}
      <div className={classNames(styles.body, props.compact && styles.compact, !showInspector && styles.withoutInspector)}>
        <SceneRail
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
          variant="desktop"
        />
        {selected ? <>
          <main className={styles.workspace}>
            <ScenePreview
              scene={selected}
              previousScene={story.scenes[story.scenes.findIndex(({ id }) => id === selected.id) - 1]}
              copy={copy}
              storyId={story.id}
              session={session}
              compact={props.compact}
              saving={saving}
              deleteDisabled={deleteDisabled}
              onDeleteScene={onDeleteScene}
              onChange={onChange}
            />
            <section className={styles.materialPanel}>
              <div className={styles.materialHeading}>
                <h2>{copy.materials}</h2>
                <span>{selected.materials.length}</span>
              </div>
              <MaterialTimeline
                scene={selected}
                previousScene={story.scenes[story.scenes.findIndex(({ id }) => id === selected.id) - 1]}
                copy={copy}
                saving={saving}
                storyId={story.id}
                session={session}
                uploading={uploading}
                backgroundUploading={backgroundUploading}
                uploadCount={uploadCount}
                variant="desktopPanel"
                onUpload={onUpload}
                onUploadBackground={onUploadBackground}
                onRemoveBackground={onRemoveBackground}
                onDeleteMaterial={onDeleteMaterial}
                onMoveToScene={onMoveMaterial}
                onEditMaterial={onEditMaterial}
                onReorder={onReorder}
              />
            </section>
          </main>
          {showInspector && <DesktopSceneInspector
            scene={selected}
            copy={copy}
            saving={saving}
            compact={props.compact}
            storyId={story.id}
            session={session}
            onChange={onChange}
          />}
        </> : <main className={styles.emptyEditor}>
          <SceneEdgeActions copy={copy} adding={adding} active onAdd={onAdd} variant="desktopEmpty" />
        </main>}
      </div>
    </div>
  );
}
