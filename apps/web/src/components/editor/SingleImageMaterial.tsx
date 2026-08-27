import { useEffect, useMemo, useRef } from "react";
import { centeredFocusPoint, createStillImageMotionPlan, verticalStoryFrame } from "@storyteller/domain";
import { getMaterialPresentation, type AuthSession, type FocusPoint, type ImageMaterial, type Scene } from "../../api.js";
import { FocusPointEditor } from "./FocusPointEditor.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { buildSingleImageMotionFrames } from "./single-image-motion.js";
import styles from "./SingleImageMaterial.module.css";

interface SingleImageMaterialProps {
  readonly scene: Scene;
  readonly material: ImageMaterial;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly active: boolean;
  readonly focusLabel: string;
  readonly focusEditable: boolean;
  readonly saving: boolean;
  readonly onFocusChange?: ((focusPoint: FocusPoint) => void) | undefined;
}

export function SingleImageMaterial({
  scene, material, storyId, session, active, focusLabel, focusEditable, saving, onFocusChange,
}: SingleImageMaterialProps) {
  const media = useRef<HTMLDivElement>(null);
  const presentation = getMaterialPresentation(material);
  const focusPoint = scene.focusPoint ?? centeredFocusPoint;
  const motionPlan = useMemo(() => createStillImageMotionPlan({
    sourceSize: { width: presentation.width, height: presentation.height },
    frameSize: verticalStoryFrame,
    orientation: presentation.orientation,
    motion: scene.motion,
    focusPoint,
  }), [focusPoint, presentation.height, presentation.orientation, presentation.width, scene.motion]);
  const frames = useMemo(
    () => buildSingleImageMotionFrames(motionPlan),
    [motionPlan],
  );

  useEffect(() => {
    const element = media.current;
    if (!element) return;
    element.style.transform = frames[0]?.transform ?? "none";
    if (!active || scene.motion === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const keyframes: Keyframe[] = frames.map(({ offset, transform }) => ({ offset, transform }));
    const animation = element.animate(keyframes, {
      duration: scene.durationSeconds * 1_000,
      easing: "linear",
      fill: "both",
      iterations: Number.POSITIVE_INFINITY,
    });
    return () => animation.cancel();
  }, [active, frames, scene.durationSeconds, scene.motion]);

  return (
    <div
      className={styles.mediaLayer}
      ref={media}
      style={{ width: `${motionPlan.geometry.width * 100}%`, height: `${motionPlan.geometry.height * 100}%` }}
    >
      <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />
      {focusEditable && onFocusChange && <FocusPointEditor
        focusPoint={focusPoint}
        label={focusLabel}
        disabled={saving}
        onCommit={onFocusChange}
      />}
    </div>
  );
}
