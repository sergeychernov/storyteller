import { useState } from "react";
import type { SceneRender, VideoExportMode } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialog } from "./MiniDialog.js";
import { PreparedSceneDownloadLink } from "./PreparedSceneDownloadLink.js";
import styles from "./SceneDownloadButton.module.css";
import { SceneRenderProgress } from "./SceneRenderProgress.js";
import type { PreparedDownloads } from "./use-scene-download.js";

interface SceneDownloadOptionsProps {
  readonly copy: EditorCopy;
  readonly isVideo: boolean;
  readonly supported: boolean;
  readonly hasAudio: boolean;
  readonly rendering: boolean;
  readonly progress: SceneRender | undefined;
  readonly preparedDownloads: PreparedDownloads;
  readonly error: string | undefined;
  readonly onDownload: (mode: VideoExportMode) => void;
  readonly onPreparedDownload: (mode: VideoExportMode) => void;
  readonly onClose: () => void;
}

export function SceneDownloadOptions({ copy, supported, isVideo, hasAudio, rendering, progress, preparedDownloads, error, onDownload, onPreparedDownload, onClose }: SceneDownloadOptionsProps) {
  const [pendingMode, setPendingMode] = useState<VideoExportMode>();
  const option = (mode: VideoExportMode, label: string, format: string, disabled: boolean) => {
    const prepared = preparedDownloads[mode];
    return prepared
      ? <PreparedSceneDownloadLink mode={mode} label={label} format={format} readyLabel={copy.renderReady}
          download={prepared} autoStart={pendingMode === mode} onDownloaded={onPreparedDownload}
          onAutoStarted={(startedMode) => setPendingMode((current) => current === startedMode ? undefined : current)} />
      : <button type="button" disabled={disabled} onClick={() => {
          setPendingMode(mode);
          onDownload(mode);
        }}>
          {label}<small>{format}</small>
        </button>;
  };
  return <MiniDialog open title={copy.downloadScene} closeLabel={copy.close} onClose={onClose}>
    <div className={styles.options}>
      {!supported && <p>{copy.renderUnsupported}</p>}
      {option("video", copy.downloadVideo, "MP4", !supported || rendering)}
      {isVideo && option("audio", copy.downloadAudio, "M4A", !supported || rendering || !hasAudio)}
      {isVideo && option("combined", copy.downloadCombined, "MP4", !supported || rendering || !hasAudio)}
      {isVideo && !hasAudio && <p>{copy.noAudioTrack}</p>}
      {rendering && progress && <SceneRenderProgress render={progress} copy={copy} />}
      {error && <p role="alert">{error}</p>}
    </div>
  </MiniDialog>;
}
