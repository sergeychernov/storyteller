import {
  centeredFocusPoint, collageBackgroundTreatment, collageCardMaterials, collageLayoutMaterials, createStillImageMotionPlan,
  evaluateStillImageMotion, getCollageFrameWidth, getSelectedCollageLayout, materialOrientationSequence,
  resolveCollageSettings, verticalStoryFrame,
} from "@storyteller/domain";
import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { getMaterialPresentation } from "../../api.js";
import { classNames } from "../../class-names.js";
import { CollageCard } from "./CollageCard.js";
import { formatCollageLayoutUnavailable } from "./collage-layout-message.js";
import type { EditorCopy } from "./editor-copy.js";
import { resolveEditorRenderer } from "./scene-renderer-model.js";
import type { ScenePlaybackPlan, ScenePlaybackSlot } from "./scene-playback-plan.js";
import styles from "./SceneFrameRenderer.module.css";

interface SceneFrameRendererProps {
  readonly plan: ScenePlaybackPlan;
  readonly copy: EditorCopy;
  readonly localTimeSeconds: number;
  readonly reducedMotion: boolean;
  readonly renderMaterial: (slot: ScenePlaybackSlot) => ReactNode;
  readonly collageBackground?: ReactNode | undefined;
  readonly onUnavailable?: (() => void) | undefined;
}

/** Pure visual scene renderer. Callers own clocks, media resources and playback lifecycle. */
export function SceneFrameRenderer(props: SceneFrameRendererProps) {
  const renderer = resolveEditorRenderer(props.plan.scene);
  if (renderer === "still-image") return <StillImageFrame {...props} />;
  if (props.plan.scene.rendererId === "collage") return <CollageFrame {...props} />;
  return <LayoutFrame {...props} />;
}

export function SceneFrameCollageBackground({ children, treated = false, mode }: {
  readonly children: ReactNode;
  readonly treated?: boolean;
  readonly mode?: string | undefined;
}) {
  return <div className={styles.collageBackground} style={treated ? {
    filter: `brightness(${1 + collageBackgroundTreatment.brightness}) saturate(${collageBackgroundTreatment.saturation})`,
  } : undefined} data-collage-background-mode={mode} aria-hidden="true">{children}</div>;
}

function StillImageFrame(props: SceneFrameRendererProps) {
  const scene = props.plan.scene;
  const playbackSlot = props.plan.slots[0];
  const material = playbackSlot?.material;
  if (!playbackSlot || material?.kind !== "image") return null;
  const presentation = getMaterialPresentation(material);
  const plan = useMemo(() => createStillImageMotionPlan({
    sourceSize: { width: presentation.width, height: presentation.height },
    frameSize: verticalStoryFrame,
    orientation: presentation.orientation,
    motion: scene.motion,
    focusPoint: scene.focusPoint ?? centeredFocusPoint,
  }), [presentation.height, presentation.orientation, presentation.width, scene.focusPoint, scene.motion]);
  const progress = props.reducedMotion || scene.motion === "none" || scene.durationSeconds <= 0
    ? 0 : Math.min(1, Math.max(0, props.localTimeSeconds / scene.durationSeconds));
  const frame = evaluateStillImageMotion(plan, progress);
  return <div className={classNames(styles.material, styles[presentation.orientation], styles.fullFrameMaterial)}>
    <div className={styles.stillMedia} data-scene-frame-still-media style={{
      width: `${plan.geometry.width * 100}%`, height: `${plan.geometry.height * 100}%`,
      transformOrigin: "0 0",
      transform: `translate(${frame.offsetX / plan.geometry.width * 100}%, ${frame.offsetY / plan.geometry.height * 100}%) scale(${frame.scale})`,
    }}>
      {props.renderMaterial(playbackSlot)}
    </div>
  </div>;
}

function LayoutFrame(props: SceneFrameRendererProps) {
  const scene = props.plan.scene;
  const fullFrame = scene.layoutId === "full-frame" || props.plan.slots.length === 1;
  const overlap = scene.layoutId === "overlap-stack";
  return <>{props.plan.slots.map((playbackSlot) => {
    const { material, index } = playbackSlot;
    const presentation = getMaterialPresentation(material);
    return <div className={classNames(
      styles.material,
      styles[presentation.orientation],
      fullFrame && styles.fullFrameMaterial,
      overlap && styles.overlapMaterial,
    )} key={material.id} style={{ "--material-index": index } as CSSProperties}>
      {props.renderMaterial(playbackSlot)}
    </div>;
  })}</>;
}

function CollageFrame(props: SceneFrameRendererProps) {
  const scene = props.plan.scene;
  const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
  const cards = props.plan.slots.map(({ material }) => material);
  const layout = getSelectedCollageLayout(cards, scene.layoutId);
  useEffect(() => {
    if (!layout) props.onUnavailable?.();
  }, [layout, props.onUnavailable]);
  if (!layout) return <div className={styles.collageUnavailable}>
    {formatCollageLayoutUnavailable(props.copy, materialOrientationSequence(cards))}
  </div>;
  const frameWidth = getCollageFrameWidth(settings.frame);
  const schedule = layout.renderer.createSchedule({
    materials: collageLayoutMaterials(cards), width: 1080, height: 1920, settings,
  });
  return <>
    {props.collageBackground}
    {props.plan.slots.map((playbackSlot, index) => {
      const { material } = playbackSlot;
      const entrance = schedule[index]!;
      const transform = evaluateCollageEntrance(entrance, props.localTimeSeconds, props.reducedMotion);
      return <CollageCard
        cardIndex={index}
        width={`${entrance.width / 10.8}%`}
        contentWidth={Math.max(2, entrance.width - frameWidth * 2)}
        contentHeight={Math.max(2, entrance.height - frameWidth * 2)}
        frame={settings.frame}
        key={material.id}
        style={{
          left: `${entrance.x / 10.8}%`, top: `${entrance.y / 19.2}%`, zIndex: entrance.stackOrder + 1,
          transform: transform.transform, visibility: transform.visible ? "visible" : "hidden",
        }}
      >{props.renderMaterial(playbackSlot)}</CollageCard>;
    })}
  </>;
}

function evaluateCollageEntrance(entrance: {
  readonly startSeconds: number; readonly endSeconds: number;
  readonly startOffsetX: number; readonly startOffsetY: number;
  readonly startAngleDegrees: number; readonly finalAngleDegrees: number;
  readonly width: number; readonly height: number;
}, localTimeSeconds: number, reducedMotion: boolean): { readonly transform: string; readonly visible: boolean } {
  if (reducedMotion) return {
    transform: `rotate(${entrance.finalAngleDegrees}deg)`, visible: localTimeSeconds >= entrance.startSeconds,
  };
  const duration = Math.max(0.001, entrance.endSeconds - entrance.startSeconds);
  const linear = Math.min(1, Math.max(0, (localTimeSeconds - entrance.startSeconds) / duration));
  const progress = 1 - Math.pow(1 - linear, 3);
  const x = entrance.startOffsetX / entrance.width * 100 * (1 - progress);
  const y = entrance.startOffsetY / entrance.height * 100 * (1 - progress);
  const angle = entrance.startAngleDegrees + (entrance.finalAngleDegrees - entrance.startAngleDegrees) * progress;
  return {
    transform: `translate(${x}%, ${y}%) rotate(${angle}deg)`,
    visible: localTimeSeconds >= entrance.startSeconds,
  };
}
