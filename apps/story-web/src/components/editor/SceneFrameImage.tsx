import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import styles from "./SceneFrameImage.module.css";
import { useSceneFrameUrl } from "./use-scene-frame-url.js";

interface SceneFrameImageProps {
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly presentation: "canvas" | "timeline";
  readonly alt?: string;
}

export function SceneFrameImage({ scene, storyId, session, presentation, alt = "" }: SceneFrameImageProps) {
  const frame = useSceneFrameUrl(scene, storyId, session);
  return frame.url
    ? <img className={classNames(styles.image, styles[presentation])} src={frame.url} alt={alt} draggable={false} />
    : <span className={classNames(
      styles.placeholder, styles[presentation], frame.loading && styles.loading, frame.failed && styles.failed,
    )} aria-hidden="true" />;
}
