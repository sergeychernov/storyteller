import { forwardRef } from "react";
import { classNames } from "../../class-names.js";
import { getMaterialPresentation } from "../../api.js";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import styles from "./SceneCanvas.module.css";
import { SingleImageMaterial } from "./SingleImageMaterial.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";

export const StillImageRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function StillImageRendererPreview(
  { scene, copy, storyId, session, active, saving, onChange }, ref,
) {
  const generation = useScenePreviewInitialization(ref);
  const material = scene.materials[0];
  if (material?.kind !== "image") return null;
  return <div key={generation} className={classNames(styles.material, styles[getMaterialPresentation(material).orientation])}>
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
});
