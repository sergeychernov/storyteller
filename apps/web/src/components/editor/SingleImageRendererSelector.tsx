import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneInspector.module.css";

interface SingleImageRendererSelectorProps {
  readonly copy: EditorCopy;
}

export function SingleImageRendererSelector({ copy }: SingleImageRendererSelectorProps) {
  return <section>
    <div className={styles.rendererOptions} role="group" aria-label={copy.animationType}>
      <button
        type="button"
        className={`${styles.rendererOption} ${styles.activeRenderer}`}
        aria-label={copy.zoom}
        aria-pressed="true"
        title={`${copy.zoom} — ${copy.zoomRendererHint}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="5.5" />
          <path d="m14.2 14.2 5.3 5.3M10 7v6M7 10h6" />
        </svg>
      </button>
      <button
        type="button"
        className={`${styles.rendererOption} ${styles.pendingRenderer}`}
        aria-label={`${copy.aiAnimation} — ${copy.comingSoon}`}
        title={`${copy.aiAnimation} — ${copy.aiAnimationHint}`}
        disabled
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8c.8 4.8 3.2 7.2 8 8-4.8.8-7.2 3.2-8 8-.8-4.8-3.2-7.2-8-8 4.8-.8 7.2-3.2 8-8Z" />
          <path d="M19 16.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5Z" />
        </svg>
      </button>
    </div>
  </section>;
}
