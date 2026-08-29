import type { AuthSession, Scene, VideoExportMode } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialog } from "./MiniDialog.js";
import styles from "./SceneDownloadButton.module.css";
import { SceneRenderVersions } from "./SceneRenderVersions.js";

interface SceneDownloadOptionsProps {
  readonly copy: EditorCopy;
  readonly scene: Scene;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly isVideo: boolean;
  readonly supported: boolean;
  readonly hasAudio: boolean;
  readonly rendering: boolean;
  readonly error: string | undefined;
  readonly onDownload: (mode: VideoExportMode) => void;
  readonly onClose: () => void;
}

export function SceneDownloadOptions({ copy, scene, storyId, session, supported, isVideo, hasAudio, rendering, error, onDownload, onClose }: SceneDownloadOptionsProps) {
  return <MiniDialog open title={copy.downloadScene} closeLabel={copy.close} onClose={onClose}>
    <div className={styles.options}>
      {!supported && <p>{copy.renderUnsupported}</p>}
      <button type="button" disabled={!supported || rendering} onClick={() => onDownload("video")}>
        {copy.downloadVideo}<small>MP4</small>
      </button>
      {isVideo && <button type="button" disabled={!supported || rendering || !hasAudio} onClick={() => onDownload("audio")}>
        {copy.downloadAudio}<small>M4A</small>
      </button>}
      {isVideo && <button type="button" disabled={!supported || rendering || !hasAudio} onClick={() => onDownload("combined")}>
        {copy.downloadCombined}<small>MP4</small>
      </button>}
      {isVideo && !hasAudio && <p>{copy.noAudioTrack}</p>}
      {rendering && <p role="status">{copy.renderingScene}</p>}
      {error && <p role="alert">{error}</p>}
      <SceneRenderVersions scene={scene} storyId={storyId} session={session} copy={copy} />
    </div>
  </MiniDialog>;
}
