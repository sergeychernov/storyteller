import type { AuthSession, VideoMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import { CroppedVideo } from "./CroppedVideo.js";
import styles from "./MaterialThumbnail.module.css";
import { useMaterialContentUrl } from "./use-material-content-url.js";
import { useVideoTrimPreview } from "./use-video-trim-preview.js";

interface CollageVideoProps {
  readonly active: boolean;
  readonly loop?: boolean;
  readonly material: VideoMaterial;
  readonly session: AuthSession;
  readonly storyId: string;
}

/** Silent crop-aware playback owned by a collage card; audio remains outside the collage renderer. */
export function CollageVideo({ active, loop = false, material, session, storyId }: CollageVideoProps) {
  const content = useMaterialContentUrl({ storyId, material, session });
  const preview = useVideoTrimPreview({
    url: content.url,
    sourceDurationSeconds: material.sourceDurationSeconds ?? material.videoTrack?.durationSeconds,
    trim: material.edit?.trim,
    disabled: !active,
    autoPlay: true,
    loop,
    exclusivePlayback: false,
  });

  if (!content.url) return <span className={classNames(styles.placeholder, styles.preview)}>▶</span>;
  return <>
    <CroppedVideo
      material={material}
      videoRef={preview.video}
      src={content.url}
      autoPlay={active}
      muted
      playsInline
      preload={active ? "auto" : "metadata"}
      aria-label={material.name}
      {...preview.mediaEvents}
    />
    {(content.failed || preview.failed) && <span className={classNames(styles.placeholder, styles.preview)} role="alert">▶</span>}
  </>;
}
