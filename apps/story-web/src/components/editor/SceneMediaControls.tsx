import type { EditorCopy } from "./editor-copy.js";
import styles from "./CroppedVideo.module.css";

interface SceneMediaControlsProps {
  readonly copy: EditorCopy;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly hasAudio: boolean;
  readonly onPlay: () => void;
  readonly onTogglePlayback: () => void;
  readonly onToggleMuted: () => void;
}

export function SceneMediaControls(props: SceneMediaControlsProps) {
  return <div className={styles.controls}>
    <button type="button" onClick={() => {
      if (!props.playing) props.onPlay();
      props.onTogglePlayback();
    }} aria-label={props.playing ? props.copy.pauseVideo : props.copy.playSelection}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={props.playing
        ? "M6 4h4v16H6zM14 4h4v16h-4z" : "M7 4v16l13-8z"} /></svg>
    </button>
    {props.hasAudio && <button type="button" onClick={props.onToggleMuted}
      aria-label={props.muted ? props.copy.unmuteVideo : props.copy.muteVideo}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l6-5v16l-6-5H3z" />
        <path d={props.muted ? "m17 9 5 6m0-6-5 6" : "M17 7q7 5 0 10"}
          fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>}
  </div>;
}
