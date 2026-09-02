import { forwardRef, Fragment } from "react";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { VideoMaterialPreview } from "./VideoMaterialPreview.js";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import { CollageRendererPreview } from "./CollageRendererPreview.js";
import { SceneFrameRenderer } from "./SceneFrameRenderer.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import styles from "./SceneCanvas.module.css";
import { useLoopingSceneTime } from "./use-looping-scene-time.js";
import { useMediaQuery } from "./use-media-query.js";

export const LayoutRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function LayoutRendererPreview(
  { scene, previousScene, copy, storyId, session, active, saving }, ref,
) {
  const generation = useScenePreviewInitialization(ref);
  const localTimeSeconds = useLoopingSceneTime(active, scene.durationSeconds, generation);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (scene.rendererId === "collage") {
    return <CollageRendererPreview key={generation} scene={scene} previousScene={previousScene} copy={copy}
      storyId={storyId} session={session} active={active} saving={saving} />;
  }
  return <Fragment key={generation}>{scene.materials.length ? <SceneFrameRenderer
    scene={scene}
    copy={copy}
    localTimeSeconds={localTimeSeconds}
    reducedMotion={reducedMotion}
    renderMaterial={({ material }) => material.kind === "video"
        ? <VideoMaterialPreview storyId={storyId} material={material} session={session} active={active} copy={copy} />
        : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
  /> : <div className={styles.empty}><span>＋</span>{copy.emptyScene}</div>}</Fragment>;
});
