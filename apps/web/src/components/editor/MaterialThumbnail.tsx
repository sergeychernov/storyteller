import type { AuthSession, SceneMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import styles from "./MaterialThumbnail.module.css";
import { useMaterialContentUrl } from "./use-material-content-url.js";

interface MaterialThumbnailProps {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly presentation: "preview" | "timeline";
  readonly className?: string;
}

export function MaterialThumbnail({ storyId, material, session, presentation, className }: MaterialThumbnailProps) {
  const { url } = useMaterialContentUrl({ storyId, material, session });

  const mediaClassName = classNames(styles[presentation], className);
  if (!url) return <span className={classNames(styles.placeholder, mediaClassName)}>{material.kind === "video" ? "▶" : "◫"}</span>;
  return material.kind === "video"
    ? <video className={classNames(styles.media, mediaClassName)} src={url} muted playsInline preload="metadata" />
    : <img className={classNames(styles.media, mediaClassName)} src={url} alt="" draggable={false} />;
}
