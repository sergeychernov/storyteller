import {
  centeredFocusPoint, collageBackgroundTreatment, collageCardMaterials, collageLayoutMaterials, createStillImageMotionPlan,
  evaluateStillImageMotion, getCollageFrameWidth, getSelectedCollageLayout, materialOrientationSequence,
  resolveCollageSettings, verticalStoryFrame,
} from "@storyteller/domain";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { getMaterialPresentation, type AuthSession, type Scene, type SceneMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import { CollageCard } from "../editor/CollageCard.js";
import { formatCollageLayoutUnavailable } from "../editor/collage-layout-message.js";
import { resolveEditorRenderer } from "../editor/scene-renderer-model.js";
import type { EditorCopy } from "../editor/editor-copy.js";
import { PreviewMaterial } from "./PreviewMaterial.js";
import type { StoryPreviewStatus } from "./use-story-preview-controller.js";
import { prefersMetadataFirstPreload } from "./use-preview-resource-url.js";
import styles from "./StoryPreview.module.css";

interface StoryPreviewSceneProps {
  readonly storyId: string;
  readonly session: AuthSession;
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly timelineIndex: number;
  readonly localTimeSeconds: number;
  readonly status: StoryPreviewStatus;
  readonly active: boolean;
  readonly pending: boolean;
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly retryKey: number;
  readonly copy: EditorCopy;
  readonly onReady: (timelineIndex: number) => void;
  readonly onWaiting: (timelineIndex: number) => void;
  readonly onFailed: (timelineIndex: number) => void;
  readonly onUnexpectedPause: (timelineIndex: number) => void;
}

export function StoryPreviewScene(props: StoryPreviewSceneProps) {
  const readyMaterials = useRef(new Set<string>());
  const required = props.scene.materials.length;
  const preload = props.active || props.pending || !prefersMetadataFirstPreload() ? "auto" : "metadata";
  const materialReady = useCallback((materialId: string) => {
    readyMaterials.current.add(materialId);
    if (readyMaterials.current.size >= required) props.onReady(props.timelineIndex);
  }, [props, required]);
  const renderer = resolveEditorRenderer(props.scene);

  if (!required) return null;
  return <div className={classNames(styles.canvas, (props.scene.layoutId === "full-frame" || required === 1) && styles.fullFrame,
    props.scene.layoutId === "overlap-stack" && styles.overlapStack)} data-preview-scene={props.scene.id}>
    {renderer === "still-image"
      ? <StillImageScene {...props} preload={preload} onMaterialReady={materialReady} />
      : props.scene.rendererId === "collage"
        ? <CollageScene {...props} preload={preload} onMaterialReady={materialReady} />
        : props.scene.materials.map((material, index) => <MaterialLayer
            {...props}
            key={material.id}
            material={material}
            materialIndex={index}
            preload={preload}
            onMaterialReady={materialReady}
          />)}
  </div>;
}

type SceneMediaProps = StoryPreviewSceneProps & {
  readonly preload: "auto" | "metadata";
  readonly onMaterialReady: (materialId: string) => void;
};

function StillImageScene(props: SceneMediaProps) {
  const material = props.scene.materials[0];
  if (material?.kind !== "image") return null;
  const presentation = getMaterialPresentation(material);
  const plan = useMemo(() => createStillImageMotionPlan({
    sourceSize: { width: presentation.width, height: presentation.height },
    frameSize: verticalStoryFrame,
    orientation: presentation.orientation,
    motion: props.scene.motion,
    focusPoint: props.scene.focusPoint ?? centeredFocusPoint,
  }), [presentation.height, presentation.orientation, presentation.width, props.scene.focusPoint, props.scene.motion]);
  const progress = props.reducedMotion || props.scene.motion === "none" || props.scene.durationSeconds <= 0
    ? 0 : Math.min(1, props.localTimeSeconds / props.scene.durationSeconds);
  const frame = evaluateStillImageMotion(plan, progress);
  return <div className={classNames(styles.material, styles[presentation.orientation])}>
    <div className={styles.stillMedia} style={{
      width: `${plan.geometry.width * 100}%`, height: `${plan.geometry.height * 100}%`,
      transform: `translate(${frame.offsetX / plan.geometry.width * 100}%, ${frame.offsetY / plan.geometry.height * 100}%) scale(${frame.scale})`,
    }}>
      <PreviewMaterialForScene {...props} material={material} onReady={() => props.onMaterialReady(material.id)} audioEnabled={false} loopVideo={false} />
    </div>
  </div>;
}

function MaterialLayer(props: SceneMediaProps & { readonly material: SceneMaterial; readonly materialIndex: number }) {
  const presentation = getMaterialPresentation(props.material);
  return <div className={classNames(styles.material, styles[presentation.orientation])}
    style={{ "--material-index": props.materialIndex } as CSSProperties}>
    <PreviewMaterialForScene
      {...props}
      material={props.material}
      onReady={() => props.onMaterialReady(props.material.id)}
      audioEnabled={props.materialIndex === 0}
      loopVideo={props.scene.materials.length > 1}
    />
  </div>;
}

function CollageScene(props: SceneMediaProps) {
  const settings = resolveCollageSettings(props.scene.materials, props.scene.collage, props.scene.durationSeconds);
  const cards = collageCardMaterials(props.scene.materials, settings);
  const layout = getSelectedCollageLayout(cards, props.scene.layoutId);
  useEffect(() => {
    if (!layout) props.onFailed(props.timelineIndex);
  }, [layout, props.onFailed, props.timelineIndex]);
  if (!layout) return <div className={styles.collageUnavailable}>
    {formatCollageLayoutUnavailable(props.copy, materialOrientationSequence(cards))}
  </div>;
  const frameWidth = getCollageFrameWidth(settings.frame);
  const schedule = layout.renderer.createSchedule({ materials: collageLayoutMaterials(cards), width: 1080, height: 1920, settings });
  const background = resolveBackgroundMaterial(props.scene, props.previousScene);
  return <>
    {background && <div className={styles.collageBackground} style={props.scene.collageBackground?.source === "material" ? undefined : {
      filter: `brightness(${1 + collageBackgroundTreatment.brightness}) saturate(${collageBackgroundTreatment.saturation})`,
    }} aria-hidden="true">
      <PreviewMaterialForScene {...props} material={background} onReady={() => undefined} audioEnabled={false} loopVideo />
    </div>}
    {cards.map((material, index) => {
      const entrance = schedule[index]!;
      const transform = collageTransform(entrance, props.localTimeSeconds, props.reducedMotion);
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
      ><PreviewMaterialForScene {...props} material={material} onReady={() => props.onMaterialReady(material.id)} audioEnabled={false} loopVideo /></CollageCard>;
    })}
  </>;
}

function PreviewMaterialForScene(props: SceneMediaProps & {
  readonly material: SceneMaterial;
  readonly onReady: () => void;
  readonly audioEnabled: boolean;
  readonly loopVideo: boolean;
}) {
  return <PreviewMaterial
    storyId={props.storyId}
    session={props.session}
    material={props.material}
    localTimeSeconds={props.localTimeSeconds}
    sceneDurationSeconds={props.scene.durationSeconds}
    status={props.status}
    active={props.active}
    muted={props.muted}
    audioEnabled={props.audioEnabled}
    loopVideo={props.loopVideo}
    preload={props.preload}
    retryKey={props.retryKey}
    onReady={props.onReady}
    onWaiting={() => props.onWaiting(props.timelineIndex)}
    onFailed={() => props.onFailed(props.timelineIndex)}
    onUnexpectedPause={() => props.onUnexpectedPause(props.timelineIndex)}
  />;
}

function resolveBackgroundMaterial(scene: Scene, previousScene: Scene | undefined): SceneMaterial | undefined {
  if (scene.collageBackground?.source === "material") return scene.collageBackground.material;
  return previousScene?.materials.at(-1) ?? scene.materials[0];
}

function collageTransform(entrance: {
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
  return { transform: `translate(${x}%, ${y}%) rotate(${angle}deg)`, visible: true };
}
