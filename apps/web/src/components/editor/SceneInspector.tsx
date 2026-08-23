import { getLayoutOptions, materialOrientationSequence } from "@storyteller/domain";
import type { Scene, SceneMotion } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";

interface SceneInspectorProps { readonly scene: Scene; readonly copy: EditorCopy; readonly saving: boolean; readonly onChange: (change: { durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion }) => void }

export function SceneInspector({ scene, copy, saving, onChange }: SceneInspectorProps) {
  const layouts = getLayoutOptions(scene.materials);
  const motions: readonly { id: SceneMotion; label: string }[] = scene.materials[0]?.orientation === "landscape"
    ? [{ id: "none", label: copy.noMotion }, { id: "pan-left", label: copy.panLeft }, { id: "pan-right", label: copy.panRight }]
    : [{ id: "none", label: copy.noMotion }, { id: "zoom-in", label: copy.zoomIn }, { id: "zoom-out", label: copy.zoomOut }];
  return (
    <aside className="scene-inspector">
      <section><div className="inspector-heading"><div><h2>{copy.layout}</h2><small>{copy.layoutHint}</small></div><code>{materialOrientationSequence(scene.materials) || "—"}</code></div>
        <div className="layout-options">{layouts.map((layout) => <button className={scene.layoutId === layout.id || (!scene.layoutId && layouts[0]?.id === layout.id) ? "active" : ""} disabled={saving} key={layout.id} onClick={() => onChange({ layoutId: layout.id })}><span className={`layout-glyph glyph-${layout.id}`}><i /><i /><i /><i /></span><strong>{layout.label}</strong><small>{layout.description}</small></button>)}</div>
      </section>
      <section><h2>{copy.motion}</h2><div className="motion-options">{motions.map((motion) => <button className={scene.motion === motion.id ? "active" : ""} disabled={saving} key={motion.id} onClick={() => onChange({ motion: motion.id })}>{motion.label}</button>)}</div></section>
      <section><div className="duration-value"><h2>{copy.duration}</h2><strong>{scene.durationSeconds} {copy.seconds}</strong></div><input className="duration-slider" type="range" min="3" max="15" value={scene.durationSeconds} disabled={saving} onChange={(event) => onChange({ durationSeconds: Number(event.target.value) })} /></section>
    </aside>
  );
}
