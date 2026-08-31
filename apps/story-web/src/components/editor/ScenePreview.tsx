import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneCanvas } from "./SceneCanvas.js";
import { ScenePreviewActions } from "./ScenePreviewActions.js";
import { formatSceneDuration } from "./scene-duration-model.js";
import styles from "./ScenePreview.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface ScenePreviewProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly compact: boolean;
  readonly saving: boolean;
  readonly deleteDisabled: boolean;
  readonly onDeleteScene: (sceneId: string) => void;
  readonly onChange: (change: SceneChange) => void;
}

export function ScenePreview({ scene, previousScene, copy, storyId, session, compact, saving, deleteDisabled, onDeleteScene, onChange }: ScenePreviewProps) {
  return (
    <section className={classNames(styles.panel, styles.desktop, compact && styles.compact)}>
      <div className={styles.label}><span>{copy.preview}</span><span className={styles.labelActions}>
        <span>9:16 · {formatSceneDuration(scene)} {copy.seconds}</span>
        <ScenePreviewActions scene={scene} storyId={storyId} session={session} copy={copy} deleteDisabled={deleteDisabled} onDeleteScene={onDeleteScene} />
      </span></div>
      <SceneCanvas
        scene={scene}
        previousScene={previousScene}
        copy={copy}
        storyId={storyId}
        session={session}
        presentation="desktop"
        saving={saving}
        onChange={onChange}
      />
    </section>
  );
}
