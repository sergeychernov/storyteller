import { classNames } from "../../class-names.js";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import styles from "./SceneCanvas.module.css";
import { SingleImageMaterial } from "./SingleImageMaterial.js";

export function StillImageRendererPreview({ scene, copy, storyId, session, active, saving, onChange }: SceneRendererPreviewProps) {
  const material = scene.materials[0];
  if (material?.kind !== "image") return null;
  return <div className={classNames(styles.material, styles[material.orientation])}>
    <SingleImageMaterial
      scene={scene}
      material={material}
      storyId={storyId}
      session={session}
      active={active}
      focusLabel={copy.moveFocusPoint}
      focusEditable={Boolean(onChange)}
      saving={saving}
      onFocusChange={onChange ? (focusPoint) => onChange({ focusPoint }) : undefined}
    />
  </div>;
}
