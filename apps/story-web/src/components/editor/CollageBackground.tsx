import { collageBackgroundTreatment } from "@storyteller/domain";
import type { CSSProperties, ReactNode } from "react";
import type { AuthSession, Scene } from "../../api.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { CollageVideo } from "./CollageVideo.js";
import { useSceneFrameUrl } from "./use-scene-frame-url.js";
import styles from "./CollageBackground.module.css";

interface CollageBackgroundProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly active: boolean;
}

const treatmentStyle = {
  filter: `brightness(${1 + collageBackgroundTreatment.brightness}) saturate(${collageBackgroundTreatment.saturation})`,
} satisfies CSSProperties;

export function CollageBackground({ scene, previousScene, storyId, session, active }: CollageBackgroundProps) {
  if (scene.collageBackground?.source === "material") {
    const material = scene.collageBackground.material;
    return <div className={styles.background} data-collage-background-mode="custom-material" aria-hidden="true">
      {material.kind === "video"
        ? <CollageVideo active={active} storyId={storyId} material={material} session={session} />
        : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
    </div>;
  }
  const fallback = <FirstCardFallback scene={scene} storyId={storyId} session={session} />;
  return previousScene
    ? <PreviousSceneBackground scene={previousScene} storyId={storyId} session={session} fallback={fallback} />
    : fallback;
}

function PreviousSceneBackground({
  scene, storyId, session, fallback,
}: {
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly fallback: ReactNode;
}) {
  const frame = useSceneFrameUrl(scene, storyId, session);
  if (!frame.url) return fallback;
  return <div className={styles.background} style={treatmentStyle}
    data-collage-background-mode="previous-scene" aria-hidden="true">
    <img src={frame.url} alt="" draggable={false} />
  </div>;
}

function FirstCardFallback({
  scene, storyId, session,
}: Omit<CollageBackgroundProps, "previousScene" | "active">) {
  const material = scene.materials[0];
  if (!material) return null;
  return <div className={styles.background} style={treatmentStyle}
    data-collage-background-mode="card-fallback" aria-hidden="true">
    <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />
  </div>;
}
