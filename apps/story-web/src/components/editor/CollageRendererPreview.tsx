import {
  collageCardMaterials, collageLayoutMaterials, getCollageFrameWidth, getSelectedCollageLayout,
  materialOrientationSequence, resolveCollageSettings,
} from "@storyteller/domain";
import { forwardRef, Fragment, type CSSProperties } from "react";
import { formatCollageLayoutUnavailable } from "./collage-layout-message.js";
import { CollageBackground } from "./CollageBackground.js";
import { CollageCard } from "./CollageCard.js";
import { CollageVideo } from "./CollageVideo.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import styles from "./SceneCanvas.module.css";

export const CollageRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function CollageRendererPreview(
  { scene, previousScene, copy, storyId, session, active }, ref,
) {
  const generation = useScenePreviewInitialization(ref);
  const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
  const cards = collageCardMaterials(scene.materials, settings);
  const layout = getSelectedCollageLayout(cards, scene.layoutId);
  if (!layout) return <div className={styles.collageUnavailable}>
    {formatCollageLayoutUnavailable(copy, materialOrientationSequence(cards))}
  </div>;
  const frameWidth = getCollageFrameWidth(settings.frame);
  const schedule = layout.renderer.createSchedule({
    materials: collageLayoutMaterials(cards),
    width: 1080, height: 1920, settings,
  });
  const animations = schedule.map((entrance, index) => collageAnimation(
    scene.id, index, entrance.startSeconds, entrance.endSeconds, entrance.finalAngleDegrees, scene.durationSeconds,
  ));
  return <Fragment key={generation}>
    <CollageBackground scene={scene} previousScene={previousScene} storyId={storyId} session={session} active={active} />
    {active && <style>{animations.map(({ keyframes }) => keyframes).join("\n")}</style>}
    {cards.map((material, index) => {
      const entrance = schedule[index]!;
      const animation = animations[index]!;
      const duration = Math.max(0, entrance.endSeconds - entrance.startSeconds);
      return <CollageCard
        cardIndex={index}
        width={`${entrance.width / 10.8}%`}
        contentWidth={Math.max(2, entrance.width - frameWidth * 2)}
        contentHeight={Math.max(2, entrance.height - frameWidth * 2)}
        frame={settings.frame}
        animated={active && duration > 0}
        key={material.id}
        style={{
          left: `${entrance.x / 10.8}%`, top: `${entrance.y / 19.2}%`,
          zIndex: entrance.stackOrder + 1,
          "--enter-x": `${entrance.startOffsetX / entrance.width * 100}%`,
          "--enter-y": `${entrance.startOffsetY / entrance.height * 100}%`,
          "--enter-rotation": `${entrance.startAngleDegrees}deg`,
          transform: `rotate(${entrance.finalAngleDegrees}deg)`,
          ...(active && duration > 0 ? {
            animationName: animation.name,
            animationDuration: `${scene.durationSeconds}s`,
            animationIterationCount: "1",
          } : {}),
        } as CSSProperties}
      >{material.kind === "video"
          ? <CollageVideo active={active} storyId={storyId} material={material} session={session} />
          : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
      </CollageCard>;
    })}
  </Fragment>;
});

function collageAnimation(
  sceneId: string, index: number, startSeconds: number, endSeconds: number,
  finalAngleDegrees: number, durationSeconds: number,
): { readonly name: string; readonly keyframes: string } {
  const name = `collage-preview-${sceneId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-${index}`;
  const start = percentage(startSeconds, durationSeconds);
  const end = Math.max(start, percentage(endSeconds, durationSeconds));
  const entering = "transform:translate(var(--enter-x),var(--enter-y)) rotate(var(--enter-rotation))";
  const stopped = `transform:translate(0,0) rotate(${finalAngleDegrees}deg)`;
  return {
    name,
    keyframes: `@keyframes ${name}{0%{${entering}}${start > 0 ? `${start}%{${entering}}` : ""}`
      + `${end}%{${stopped}}${end < 100 ? `100%{${stopped}}` : ""}}`,
  };
}

function percentage(seconds: number, durationSeconds: number): number {
  return Number((Math.min(1, Math.max(0, seconds / durationSeconds)) * 100).toFixed(4));
}
