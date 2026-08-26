import { getLayoutOptions, materialOrientationSequence } from "@storyteller/domain";
import type { Scene, SceneMotion } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneInspector.module.css";

interface SceneInspectorProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly panel: "layout" | "motion";
  readonly variant?: "default" | "desktop";
  readonly onChange: (change: { durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion }) => void;
}

export function SceneInspector({ scene, copy, saving, panel, variant = "default", onChange }: SceneInspectorProps) {
  const layouts = getLayoutOptions(scene.materials);
  const motions: readonly { id: SceneMotion; label: string }[] = scene.materials[0]?.orientation === "landscape"
    ? [{ id: "none", label: copy.noMotion }, { id: "pan-left", label: copy.panLeft }, { id: "pan-right", label: copy.panRight }]
    : [{ id: "none", label: copy.noMotion }, { id: "zoom-in", label: copy.zoomIn }, { id: "zoom-out", label: copy.zoomOut }];
  return (
    <div className={classNames(styles.panel, variant === "desktop" && styles.desktop)}>
      {panel === "layout" && <section><div className={styles.heading}><div><h2>{copy.layout}</h2><small>{copy.layoutHint}</small></div><code>{materialOrientationSequence(scene.materials) || "—"}</code></div>
        <div className={styles.layoutOptions}>{layouts.map((layout) => <button className={scene.layoutId === layout.id || (!scene.layoutId && layouts[0]?.id === layout.id) ? styles.active : undefined} disabled={saving} key={layout.id} onClick={() => onChange({ layoutId: layout.id })}><span className={classNames(styles.layoutGlyph, glyphClassName(layout.id))}><i /><i /><i /><i /></span><strong>{layout.label}</strong><small>{layout.description}</small></button>)}</div>
      </section>}
      {panel === "motion" && <>
        <section><h2>{copy.motion}</h2><div className={styles.motionOptions}>{motions.map((motion) => <button className={scene.motion === motion.id ? styles.active : undefined} disabled={saving} key={motion.id} onClick={() => onChange({ motion: motion.id })}>{motion.label}</button>)}</div></section>
        <section><div className={styles.durationValue}><h2>{copy.duration}</h2><strong>{scene.durationSeconds} {copy.seconds}</strong></div><input className={styles.durationSlider} type="range" min="3" max="15" value={scene.durationSeconds} disabled={saving} onChange={(event) => onChange({ durationSeconds: Number(event.target.value) })} /></section>
      </>}
    </div>
  );
}

function glyphClassName(layoutId: string): string | undefined {
  if (layoutId === "stack") return styles.glyphStack;
  if (layoutId === "2+1") return styles.glyphTwoOne;
  if (layoutId === "2+1+2") return styles.glyphTwoOneTwo;
  if (layoutId === "2+2+1") return styles.glyphTwoTwoOne;
  if (layoutId === "overlap-stack") return styles.glyphOverlap;
  return undefined;
}
