import type { VideoExportMode } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialog } from "./MiniDialog.js";
import styles from "./SceneDownloadButton.module.css";

interface SceneDownloadOptionsProps {
  readonly copy: EditorCopy;
  readonly hasAudio: boolean;
  readonly rendering: boolean;
  readonly error: string | undefined;
  readonly file: { readonly url: string; readonly filename: string } | undefined;
  readonly onDownload: (mode: VideoExportMode) => void;
  readonly onClose: () => void;
}

export function SceneDownloadOptions({ copy, hasAudio, rendering, error, file, onDownload, onClose }: SceneDownloadOptionsProps) {
  return <MiniDialog open title={copy.downloadScene} closeLabel={copy.close} onClose={onClose}>
    <div className={styles.options}>
      <button type="button" disabled={rendering} onClick={() => onDownload("video")}>
        {copy.downloadVideo}<small>MP4</small>
      </button>
      <button type="button" disabled={rendering || !hasAudio} onClick={() => onDownload("audio")}>
        {copy.downloadAudio}<small>M4A</small>
      </button>
      <button type="button" disabled={rendering || !hasAudio} onClick={() => onDownload("combined")}>
        {copy.downloadCombined}<small>MP4</small>
      </button>
      {!hasAudio && <p>{copy.noAudioTrack}</p>}
      {rendering && <p role="status">{copy.renderingScene}</p>}
      {error && <p role="alert">{error}</p>}
      {!rendering && file && <a href={file.url} download={file.filename}>{copy.downloadPreparedFile}</a>}
    </div>
  </MiniDialog>;
}
