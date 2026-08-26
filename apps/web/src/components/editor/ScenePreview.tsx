import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneCanvas } from "./SceneCanvas.js";
import styles from "./ScenePreview.module.css";

interface ScenePreviewProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly compact: boolean;
}

export function ScenePreview({ scene, copy, storyId, session, compact }: ScenePreviewProps) {
  return (
    <section className={classNames(styles.panel, styles.desktop, compact && styles.compact)}>
      <div className={styles.label}><span>{copy.preview}</span><span>9:16 · {scene.durationSeconds} {copy.seconds}</span></div>
      <SceneCanvas scene={scene} copy={copy} storyId={storyId} session={session} presentation="desktop" />
    </section>
  );
}
