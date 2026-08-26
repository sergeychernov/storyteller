import { getSceneMotionOptions } from "@storyteller/domain";
import type { SceneMotion } from "../../api.js";
import type { SceneRendererSettingsProps } from "./SceneRenderer.js";
import { SceneDurationControl } from "./SceneDurationControl.js";
import styles from "./SceneInspector.module.css";

export function StillImageRendererSettings({ scene, copy, saving, onChange }: SceneRendererSettingsProps) {
  const material = scene.materials[0];
  if (material?.kind !== "image") return null;
  const labels: Readonly<Record<SceneMotion, string>> = {
    none: copy.noMotion, "pan-left": copy.panLeft, "pan-right": copy.panRight,
    "zoom-in": copy.zoomIn, "zoom-out": copy.zoomOut,
  };
  const motions = getSceneMotionOptions(scene.materials).filter((id) => id !== "none").map((id) => ({ id, label: labels[id] }));
  return <>
    <section>
      <div
        className={styles.motionOptions}
        role="group"
        aria-label={material.orientation === "portrait" ? copy.zoomDirectionHint : copy.panDirectionHint}
      >{motions.map((motion) => <button
        type="button"
        className={scene.motion === motion.id ? styles.active : undefined}
        disabled={saving}
        key={motion.id}
        aria-label={motion.label}
        title={motion.label}
        onClick={() => onChange({ motion: motion.id })}
      ><MotionGlyph motion={motion.id} /></button>)}</div>
    </section>
    <SceneDurationControl
      durationSeconds={scene.durationSeconds}
      copy={copy}
      saving={saving}
      onCommit={(durationSeconds) => onChange({ durationSeconds })}
    />
  </>;
}

function MotionGlyph({ motion }: { readonly motion: SceneMotion }) {
  if (motion === "pan-left" || motion === "pan-right") return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={motion === "pan-left" ? "M19 12H5m5-5-5 5 5 5" : "M5 12h14m-5-5 5 5-5 5"} />
  </svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10" cy="10" r="5.5" />
    <path d="m14.2 14.2 5.3 5.3M7 10h6" />
    {motion === "zoom-in" && <path d="M10 7v6" />}
  </svg>;
}
