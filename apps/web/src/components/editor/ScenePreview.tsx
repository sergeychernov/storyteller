import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneCanvas } from "./SceneCanvas.js";
import { SceneDownloadButton } from "./SceneDownloadButton.js";
import styles from "./ScenePreview.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface ScenePreviewProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly compact: boolean;
  readonly saving: boolean;
  readonly onChange: (change: SceneChange) => void;
}

export function ScenePreview({ scene, copy, storyId, session, compact, saving, onChange }: ScenePreviewProps) {
  return (
    <section className={classNames(styles.panel, styles.desktop, compact && styles.compact)}>
      <div className={styles.label}><span>{copy.preview}</span><span className={styles.labelActions}>
        <span>9:16 · {scene.durationSeconds} {copy.seconds}</span>
        <SceneDownloadButton scene={scene} storyId={storyId} session={session} copy={copy} />
      </span></div>
      <SceneCanvas
        scene={scene}
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
