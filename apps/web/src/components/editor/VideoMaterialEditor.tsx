import type { AuthSession, MaterialEdit, VideoMaterial, VideoTrim } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialCropStage } from "./MaterialCropStage.js";
import { updateTrimBoundary, withVideoTrim } from "./material-editor-model.js";
import { useVideoTrimPreview } from "./use-video-trim-preview.js";
import { useMaterialWaveform } from "./use-material-waveform.js";
import { VideoWaveformTimeline } from "./VideoWaveformTimeline.js";
import { formatVideoTime } from "./video-timeline-model.js";
import styles from "./VideoMaterialEditor.module.css";
import { useMaterialContentUrl } from "./use-material-content-url.js";
import { useLinkedVideoAudio } from "./use-linked-video-audio.js";

interface VideoMaterialEditorProps {
  readonly storyId: string;
  readonly session: AuthSession;
  readonly material: VideoMaterial;
  readonly url: string | undefined;
  readonly loading: boolean;
  readonly sourceFailed: boolean;
  readonly edit: MaterialEdit;
  readonly width: number;
  readonly height: number;
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly onChange: (edit: MaterialEdit) => void;
}

export function VideoMaterialEditor({
  storyId, session, material, url, loading, sourceFailed, edit, width, height, copy, disabled, onChange,
}: VideoMaterialEditorProps) {
  const preview = useVideoTrimPreview({ url, sourceDurationSeconds: material.sourceDurationSeconds, trim: edit.trim, disabled });
  const waveform = useMaterialWaveform(storyId, material, session);
  const audioContent = useMaterialContentUrl({ storyId, material, session, audio: true });
  const sound = useLinkedVideoAudio(preview.video, audioContent.url);
  const range = edit.trim ?? { startSeconds: 0, endSeconds: preview.duration };
  const sideways = edit.rotation === 90 || edit.rotation === 270;
  const unavailable = disabled || !url || preview.duration <= 0 || preview.failed || sourceFailed;

  function changeBoundary(boundary: keyof VideoTrim, value: number) {
    const next = updateTrimBoundary(range, boundary, value, preview.duration);
    onChange(withVideoTrim(edit, next, preview.duration));
  }

  return <>
    <MaterialCropStage
      material={material} url={url} loading={loading} sourceFailed={sourceFailed || preview.failed}
      edit={edit} width={width} height={height} label={copy.cropArea} disabled={disabled}
      onCropChange={(crop) => onChange({ ...edit, crop })}
    >
      <video
        ref={preview.video} src={url} muted={Boolean(material.audioTrack)} playsInline preload="auto" className={styles.video}
        aria-label={copy.videoEditPreview}
        style={{
          width: `${sideways ? height / width * 100 : 100}%`,
          height: `${sideways ? width / height * 100 : 100}%`,
          transform: `translate(-50%, -50%) rotate(${edit.rotation}deg)`,
        }}
        {...preview.mediaEvents}
      />
    </MaterialCropStage>
    {material.audioTrack && <audio ref={sound.audio} src={audioContent.url} preload="auto" onError={sound.onError} />}
    <section className={styles.trim} aria-label={copy.trimMaterial}>
      <div className={styles.playback}>
        <button type="button" disabled={unavailable} onClick={preview.togglePlayback}
          aria-label={preview.playing ? copy.pauseVideo : copy.playSelection} title={preview.playing ? copy.pauseVideo : copy.playSelection}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {preview.playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4v16l13-8z" />}
          </svg>
        </button>
        <output aria-live="off">{formatVideoTime(preview.currentTime)} / {formatVideoTime(preview.duration)}</output>
      </div>
      <VideoWaveformTimeline
        duration={preview.duration} currentTime={preview.currentTime} range={range} copy={copy}
        peaks={waveform.peaks} loading={waveform.loading} failed={waveform.failed} hasAudio={material.hasAudio}
        disabled={unavailable} onSeek={preview.seek} onBoundaryChange={changeBoundary}
      />
      {(preview.failed || sound.failed || audioContent.failed) && <p className={styles.error} role="alert">{copy.videoPlaybackError}</p>}
      {!loading && !sourceFailed && preview.duration <= 0 && <p>{copy.videoDurationUnavailable}</p>}
    </section>
  </>;
}
