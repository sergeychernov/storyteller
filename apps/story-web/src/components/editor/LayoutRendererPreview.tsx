import { forwardRef, Fragment, type CSSProperties } from "react";
import { getMaterialPresentation } from "../../api.js";
import { classNames } from "../../class-names.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { VideoMaterialPreview } from "./VideoMaterialPreview.js";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import { CollageRendererPreview } from "./CollageRendererPreview.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import styles from "./SceneCanvas.module.css";

export const LayoutRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function LayoutRendererPreview(
  { scene, previousScene, copy, storyId, session, active, saving }, ref,
) {
  const generation = useScenePreviewInitialization(ref);
  if (scene.rendererId === "collage") {
    return <CollageRendererPreview key={generation} scene={scene} previousScene={previousScene} copy={copy}
      storyId={storyId} session={session} active={active} saving={saving} />;
  }
  return <Fragment key={generation}>{scene.materials.length ? scene.materials.map((material, index) => (
    <div
      className={classNames(styles.material, styles[getMaterialPresentation(material).orientation])}
      key={material.id}
      style={{ "--material-index": index } as CSSProperties}
    >
      {material.kind === "video"
        ? <VideoMaterialPreview storyId={storyId} material={material} session={session} active={active} copy={copy} />
        : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
    </div>
  )) : <div className={styles.empty}><span>＋</span>{copy.emptyScene}</div>}</Fragment>;
});
