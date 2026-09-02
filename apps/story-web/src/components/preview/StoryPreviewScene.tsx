import { useCallback, useRef } from "react";
import { type AuthSession, type Scene, type SceneMaterial } from "../../api.js";
import {
  SceneFrameCollageBackground, SceneFrameRenderer, type SceneFrameMaterialContext,
} from "../editor/SceneFrameRenderer.js";
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
  }, [props.onReady, props.timelineIndex, required]);
  const unavailable = useCallback(() => props.onFailed(props.timelineIndex), [props.onFailed, props.timelineIndex]);
  if (!required) return null;

  const renderMaterial = ({ material, audioEnabled, loopVideo }: SceneFrameMaterialContext) => <PreviewMaterialForScene
    {...props}
    key={material.id}
    material={material}
    preload={preload}
    onReady={() => materialReady(material.id)}
    audioEnabled={audioEnabled}
    loopVideo={loopVideo}
  />;
  const backgroundMaterial = resolveBackgroundMaterial(props.scene, props.previousScene);
  const background = props.scene.rendererId === "collage" && backgroundMaterial
    ? <SceneFrameCollageBackground treated={props.scene.collageBackground?.source !== "material"}>
      <PreviewMaterialForScene
        {...props}
        material={backgroundMaterial}
        preload={preload}
        onReady={() => undefined}
        audioEnabled={false}
        loopVideo
      />
    </SceneFrameCollageBackground>
    : undefined;

  return <div className={styles.canvas} data-preview-scene={props.scene.id}>
    <SceneFrameRenderer
      scene={props.scene}
      copy={props.copy}
      localTimeSeconds={props.localTimeSeconds}
      reducedMotion={props.reducedMotion}
      renderMaterial={renderMaterial}
      collageBackground={background}
      onUnavailable={unavailable}
    />
  </div>;
}

type SceneMediaProps = StoryPreviewSceneProps & {
  readonly preload: "auto" | "metadata";
};

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
