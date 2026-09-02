import { forwardRef, Fragment } from "react";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import { CollageBackground } from "./CollageBackground.js";
import { CollageVideo } from "./CollageVideo.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { SceneFrameRenderer } from "./SceneFrameRenderer.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import { useLoopingSceneTime } from "./use-looping-scene-time.js";
import { useMediaQuery } from "./use-media-query.js";

export const CollageRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function CollageRendererPreview(
  { scene, previousScene, copy, storyId, session, active }, ref,
) {
  const generation = useScenePreviewInitialization(ref);
  const localTimeSeconds = useLoopingSceneTime(active, scene.durationSeconds, generation);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return <Fragment key={generation}><SceneFrameRenderer
    scene={scene}
    copy={copy}
    localTimeSeconds={localTimeSeconds}
    reducedMotion={reducedMotion}
    collageBackground={<CollageBackground
      scene={scene}
      previousScene={previousScene}
      storyId={storyId}
      session={session}
      active={active}
    />}
    renderMaterial={({ material, loopVideo }) => material.kind === "video"
      ? <CollageVideo active={active} loop={loopVideo} storyId={storyId} material={material} session={session} />
      : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
  /></Fragment>;
});
