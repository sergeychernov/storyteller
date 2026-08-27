import { useId, useMemo } from "react";
import type { VideoTrim } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { formatVideoTime, timelineRatio, waveformPath } from "./video-timeline-model.js";
import { useVideoTimelineDrag } from "./use-video-timeline-drag.js";
import styles from "./VideoWaveformTimeline.module.css";

interface VideoWaveformTimelineProps {
  readonly duration: number;
  readonly range: VideoTrim;
  readonly currentTime: number;
  readonly peaks: readonly number[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly hasAudio: boolean;
  readonly disabled: boolean;
  readonly copy: EditorCopy;
  readonly onSeek: (seconds: number) => void;
  readonly onBoundaryChange: (boundary: keyof VideoTrim, seconds: number) => void;
}

export function VideoWaveformTimeline(props: VideoWaveformTimelineProps) {
  const { duration, range, currentTime, peaks, loading, failed, hasAudio, disabled, copy } = props;
  const drag = useVideoTimelineDrag(props);
  const clipId = useId();
  const path = useMemo(() => waveformPath(peaks), [peaks]);
  const start = timelineRatio(range.startSeconds, duration);
  const end = timelineRatio(range.endSeconds, duration);
  const message = !hasAudio ? copy.silent : loading ? copy.waveformLoading : failed ? copy.waveformUnavailable : undefined;

  return <div className={styles.timeline}>
    <div className={styles.track} ref={drag.track} {...drag.trackEvents} onContextMenu={(event) => event.preventDefault()}>
      <svg className={styles.waveform} viewBox="0 0 1024 64" preserveAspectRatio="none" aria-label={copy.audioWaveform} role="img">
        <defs><clipPath id={clipId}><rect x={start * 1_024} y="0" width={(end - start) * 1_024} height="64" /></clipPath></defs>
        <path d="M0 32H1024" className={styles.baseline} />
        <path d={path} className={styles.mutedWave} />
        <path d={path} className={styles.selectedWave} clipPath={`url(#${clipId})`} />
      </svg>
      <div className={styles.selection} style={{ left: `${start * 100}%`, width: `${(end - start) * 100}%` }} />
      {message && <span className={styles.message} role="status">{message}</span>}
      <div
        className={styles.playhead} data-playhead="true" style={{ left: `${timelineRatio(currentTime, duration) * 100}%` }}
        role="slider" aria-label={copy.videoPosition} aria-orientation="horizontal" aria-disabled={disabled}
        aria-valuemin={range.startSeconds} aria-valuemax={range.endSeconds} aria-valuenow={Math.max(range.startSeconds, Math.min(range.endSeconds, currentTime))}
        aria-valuetext={formatVideoTime(currentTime)} tabIndex={disabled ? -1 : 0}
        onPointerDown={(event) => drag.start(event, "playhead")} onKeyDown={(event) => drag.keyDown(event, "playhead")}
      />
      {(["startSeconds", "endSeconds"] as const).map((boundary) => <div
        key={boundary} className={styles.boundary} data-boundary={boundary}
        style={{
          ...(boundary === "startSeconds" ? { left: `calc(${start * 100}% - 24px)` } : { right: `calc(${(1 - end) * 100}% - 24px)` }),
          // Keep a full outer grab area; the inner areas may meet but must never overlap.
          width: `min(36px, calc(24px + ${(end - start) * 50}%))`,
        }}
        role="slider" aria-label={boundary === "startSeconds" ? copy.trimStart : copy.trimEnd} aria-orientation="horizontal" aria-disabled={disabled}
        aria-valuemin={boundary === "startSeconds" ? 0 : range.startSeconds + Math.min(0.1, duration - range.startSeconds)}
        aria-valuemax={boundary === "endSeconds" ? duration : range.endSeconds - Math.min(0.1, range.endSeconds)}
        aria-valuenow={range[boundary]} aria-valuetext={formatVideoTime(range[boundary])} tabIndex={disabled ? -1 : 0}
        onPointerDown={(event) => drag.start(event, boundary)} onKeyDown={(event) => drag.keyDown(event, boundary)}
      >
        <svg viewBox="0 0 24 64" aria-hidden="true"><path d={boundary === "startSeconds" ? "M21 2H12V62H21" : "M3 2H12V62H3"} /></svg>
      </div>)}
    </div>
    <div className={styles.times}>
      <span>{formatVideoTime(range.startSeconds)}</span>
      <span>{copy.selectedDuration.replace("{{duration}}", (range.endSeconds - range.startSeconds).toFixed(2))}</span>
      <span>{formatVideoTime(range.endSeconds)}</span>
    </div>
  </div>;
}
