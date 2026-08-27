import { useState } from "react";
import type { AuthSession, VideoMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./MaterialThumbnail.module.css";
import { useMaterialContentUrl } from "./use-material-content-url.js";
import { useLinkedVideoAudio } from "./use-linked-video-audio.js";
import { useVideoTrimPreview } from "./use-video-trim-preview.js";
import { CroppedVideo } from "./CroppedVideo.js";
import videoStyles from "./CroppedVideo.module.css";

interface VideoMaterialPreviewProps {
  readonly storyId: string;
  readonly material: VideoMaterial;
  readonly session: AuthSession;
  readonly active: boolean;
  readonly copy: EditorCopy;
}

export function VideoMaterialPreview({ storyId, material, session, active, copy }: VideoMaterialPreviewProps) {
  const { url, failed: sourceFailed } = useMaterialContentUrl({ storyId, material, session });
  const [muted, setMuted] = useState(true);
  const preview = useVideoTrimPreview({ url, sourceDurationSeconds: material.sourceDurationSeconds,
    trim: material.edit?.trim, disabled: !active, autoPlay: true, loop: true });
  const audioContent = useMaterialContentUrl({ storyId, material, session, audio: true });
  const sound = useLinkedVideoAudio(preview.video, audioContent.url, muted);

  return <>
    <CroppedVideo
      material={material} videoRef={preview.video}
      src={url}
      autoPlay={active}
      muted={Boolean(material.audioTrack) || muted}
      playsInline
      preload={active ? "auto" : "metadata"}
      aria-label={material.name}
      {...preview.mediaEvents}
    />
    {material.audioTrack && <audio ref={sound.audio} src={audioContent.url} preload="auto" muted={muted} onError={sound.onError} />}
    {active && <div className={videoStyles.controls}>
      <button type="button" onClick={preview.togglePlayback} aria-label={preview.playing ? copy.pauseVideo : copy.playSelection}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={preview.playing ? "M6 4h4v16H6zM14 4h4v16h-4z" : "M7 4v16l13-8z"} /></svg>
      </button>
      {material.hasAudio && <button type="button" onClick={() => { if (muted) sound.resume(); setMuted(!muted); }} aria-label={muted ? copy.unmuteVideo : copy.muteVideo}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l6-5v16l-6-5H3z" />
          <path d={muted ? "m17 9 5 6m0-6-5 6" : "M17 7q7 5 0 10"} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>}
    </div>}
    {(preview.failed || sourceFailed || sound.failed || audioContent.failed) && <span className={classNames(styles.placeholder, styles.preview)} role="alert">{copy.videoPlaybackError}</span>}
  </>;
}
