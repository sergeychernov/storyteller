import type { ReactNode } from "react";
import type { AuthSession, Scene } from "../../api.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { CollageVideo } from "./CollageVideo.js";
import { SceneFrameCollageBackground } from "./SceneFrameRenderer.js";
import { useSceneFrameUrl } from "./use-scene-frame-url.js";

interface CollageBackgroundProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly active: boolean;
}

export function CollageBackground({ scene, previousScene, storyId, session, active }: CollageBackgroundProps) {
  if (scene.collageBackground?.source === "material") {
    const material = scene.collageBackground.material;
    return <SceneFrameCollageBackground mode="custom-material">
      {material.kind === "video"
        ? <CollageVideo active={active} storyId={storyId} material={material} session={session} />
        : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
    </SceneFrameCollageBackground>;
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
  return <SceneFrameCollageBackground treated mode="previous-scene">
    <img src={frame.url} alt="" draggable={false} />
  </SceneFrameCollageBackground>;
}

function FirstCardFallback({
  scene, storyId, session,
}: Omit<CollageBackgroundProps, "previousScene" | "active">) {
  const material = scene.materials[0];
  if (!material) return null;
  return <SceneFrameCollageBackground treated mode="card-fallback">
    <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />
  </SceneFrameCollageBackground>;
}
