import { classNames } from "../../class-names.js";
import sharedStyles from "./editor-shared.module.css";
import type { StoryEditorViewProps } from "./story-editor-view.js";
import { DesktopEditorHeader } from "./DesktopEditorHeader.js";
import { DesktopSceneInspector } from "./DesktopSceneInspector.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneEdgeActions } from "./SceneEdgeActions.js";
import { ScenePreview } from "./ScenePreview.js";
import { SceneRail } from "./SceneRail.js";
import styles from "./DesktopStoryEditor.module.css";

interface DesktopStoryEditorProps extends StoryEditorViewProps {
  readonly compact: boolean;
}

export function DesktopStoryEditor(props: DesktopStoryEditorProps) {
  const {
    story, session, selected, copy, saving, adding, uploading, uploadCount, operationErrorMessage,
    onSelect, onAdd, onUpload, onDeleteMaterial, onEditMaterial, onReorder, onChange,
  } = props;

  return (
    <div className={styles.editor}>
      <DesktopEditorHeader storyTitle={story.title} scenes={story.scenes} selected={selected} copy={copy} saving={saving} compact={props.compact} />
      {operationErrorMessage && <div className={classNames(sharedStyles.operationError, styles.operationError)} role="alert">{operationErrorMessage}</div>}
      <div className={classNames(styles.body, props.compact && styles.compact, !selected && styles.empty)}>
        <SceneRail scenes={story.scenes} selectedId={selected?.id ?? ""} copy={copy} adding={adding} onSelect={onSelect} onAdd={onAdd} variant="desktop" />
        {selected ? <>
          <main className={styles.workspace}>
            <ScenePreview
              scene={selected}
              copy={copy}
              storyId={story.id}
              session={session}
              compact={props.compact}
              saving={saving}
              onChange={onChange}
            />
            <section className={styles.materialPanel}>
              <div className={styles.materialHeading}>
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
                variant="desktopPanel"
                onUpload={onUpload}
                onDeleteMaterial={onDeleteMaterial}
                onEditMaterial={onEditMaterial}
                onReorder={onReorder}
              />
            </section>
          </main>
          <DesktopSceneInspector
            scene={selected}
            copy={copy}
            saving={saving}
            compact={props.compact}
            storyId={story.id}
            session={session}
            onChange={onChange}
          />
        </> : <main className={styles.emptyEditor}>
          <SceneEdgeActions copy={copy} adding={adding} active onAdd={onAdd} variant="desktopEmpty" />
        </main>}
      </div>
    </div>
  );
}
