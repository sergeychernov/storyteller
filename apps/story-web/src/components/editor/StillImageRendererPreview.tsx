import { forwardRef, Fragment } from "react";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import { FocusPointEditor } from "./FocusPointEditor.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { SceneFrameRenderer } from "./SceneFrameRenderer.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import { useLoopingSceneTime } from "./use-looping-scene-time.js";
import { useMediaQuery } from "./use-media-query.js";

export const StillImageRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function StillImageRendererPreview(
  { scene, copy, storyId, session, active, saving, onChange }, ref,
) {
  const generation = useScenePreviewInitialization(ref);
  const localTimeSeconds = useLoopingSceneTime(active, scene.durationSeconds, generation);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const material = scene.materials[0];
  if (material?.kind !== "image") return null;
  return <Fragment key={generation}><SceneFrameRenderer
    scene={scene}
    copy={copy}
    localTimeSeconds={localTimeSeconds}
    reducedMotion={reducedMotion}
    renderMaterial={() => <>
      <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />
      {onChange && <FocusPointEditor
        focusPoint={scene.focusPoint ?? { x: 0.5, y: 0.5 }}
        label={copy.moveFocusPoint}
        disabled={saving}
        onCommit={(focusPoint) => onChange({ focusPoint })}
      />}
    </>}
  /></Fragment>;
});
