import type { AuthSession, SceneMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import styles from "./MaterialThumbnail.module.css";
import { useMaterialContentUrl } from "./use-material-content-url.js";
import { CroppedVideo } from "./CroppedVideo.js";

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
  const suppressNativeMediaActions = presentation === "timeline";
  if (!url) return <span className={classNames(styles.placeholder, mediaClassName)}>{material.kind === "video" ? "▶" : "◫"}</span>;
  return material.kind === "video"
    ? <CroppedVideo material={material} src={url} muted playsInline preload="metadata" fit={presentation === "timeline" ? "contain" : "cover"}
      disableNativeActions={suppressNativeMediaActions}
      onLoadedMetadata={(event) => { event.currentTarget.currentTime = material.edit?.trim?.startSeconds ?? 0; }} />
    : <img
      className={classNames(styles.media, mediaClassName)}
      src={url}
      alt=""
      draggable={false}
      {...(suppressNativeMediaActions ? { onContextMenu: (event) => event.preventDefault() } : {})}
    />;
}
