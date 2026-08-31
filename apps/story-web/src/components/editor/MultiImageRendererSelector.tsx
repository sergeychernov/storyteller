import {
  collageCardMaterials, getCollageLayoutOptions, materialOrientationSequence, resolveCollageSettings,
} from "@storyteller/domain";
import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { formatCollageLayoutUnavailable } from "./collage-layout-message.js";
import { LayoutGlyph } from "./SceneLayoutSelector.js";
import styles from "./SceneInspector.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface MultiImageRendererSelectorProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly onChange: (change: SceneChange) => void;
}

export function MultiImageRendererSelector({ scene, copy, saving, onChange }: MultiImageRendererSelectorProps) {
  const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
  const cards = collageCardMaterials(scene.materials, settings);
  const layouts = getCollageLayoutOptions(cards);
  const sequence = materialOrientationSequence(cards).toUpperCase();
  return <>
    <section>
      <div className={styles.optionGroup} role="group" aria-label={copy.animationType}>
        <button
          type="button"
          className={classNames(styles.optionButton, styles.activeOption)}
          aria-label={copy.animatedCollage}
          aria-pressed="true"
          title={`${copy.animatedCollage} — ${copy.animatedCollageHint}`}
        ><LayoutGlyph layoutId="overlap-stack" /></button>
        <button
          type="button"
          className={classNames(styles.optionButton, styles.pendingOption)}
          aria-label={`${copy.aiAnimation} — ${copy.comingSoon}`}
          title={`${copy.aiAnimation} — ${copy.aiAnimationHint}`}
          disabled
        ><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8c.8 4.8 3.2 7.2 8 8-4.8.8-7.2 3.2-8 8-.8-4.8-3.2-7.2-8-8 4.8-.8 7.2-3.2 8-8Z" />
          <path d="M19 16.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5Z" />
        </svg></button>
      </div>
    </section>
    {layouts.length === 0 && <p className={styles.layoutMessage} role="status">
      {formatCollageLayoutUnavailable(copy, sequence)}
    </p>}
    {layouts.length > 1 && <section>
      <div className={styles.heading}>
        <div><h2>{copy.collageFinalLayout}</h2><small>{copy.layoutHint}</small></div>
        <code>{sequence}</code>
      </div>
      <div className={styles.optionGroup} role="group" aria-label={copy.collageFinalLayout}>
        {layouts.map((layout) => <button
          type="button"
          className={classNames(styles.optionButton, scene.layoutId === layout.id && styles.activeOption)}
          disabled={saving}
          key={layout.id}
          aria-label={layout.label}
          aria-pressed={scene.layoutId === layout.id}
          title={`${layout.label} — ${layout.description}`}
          onClick={() => onChange({ layoutId: layout.id })}
        ><LayoutGlyph layoutId={layout.id} /></button>)}
      </div>
    </section>}
  </>;
}
