import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import sharedStyles from "./editor-shared.module.css";
import { SceneRail } from "./SceneRail.js";
import styles from "./EmptyScenePipeline.module.css";

interface EmptyScenePipelineProps {
  readonly copy: EditorCopy;
  readonly creating: boolean;
  readonly error: boolean;
  readonly onCreate: () => void;
}

export function EmptyScenePipeline({ copy, creating, error, onCreate }: EmptyScenePipelineProps) {
  return (
    <div className={styles.editor}>
      {error && <div className={sharedStyles.operationError} role="alert">{copy.sceneCreateError}</div>}
      <SceneRail scenes={[]} selectedId="" copy={copy} onSelect={() => undefined} onAdd={onCreate} adding={creating} />
      <main className={styles.workspace}>
        <section className={styles.previewPanel}>
          <div className={styles.previewLabel}><span>{copy.preview}</span><span>9:16</span></div>
          <div className={styles.emptyCanvas}>
            <span>＋</span><strong>{creating ? copy.creatingScene : copy.emptyPipelineHint}</strong>
          </div>
        </section>
        <section className={styles.materialSection}>
          <div className={styles.sectionHead}><h2>{copy.materials}</h2><button className={classNames(sharedStyles.secondaryButton, sharedStyles.secondaryButtonCompact)} disabled>＋ {copy.addMaterial}</button></div>
          <div className={styles.materialTrack}><i /><i /><i /></div>
        </section>
      </main>
      <aside className={styles.inspector}>
        <section><h2>{copy.layout}</h2><div className={styles.setting}><i /><i /></div></section>
        <section><h2>{copy.motion}</h2><div className={classNames(styles.setting, styles.motionSetting)}><i /><i /><i /></div></section>
        <section><div className={styles.durationValue}><h2>{copy.duration}</h2><strong>—</strong></div><div className={styles.emptyDuration} /></section>
      </aside>
    </div>
  );
}
