import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneRenderVersions.module.css";
import { useSceneRenderVersions } from "./use-scene-render-versions.js";

interface Props { readonly scene: Scene; readonly storyId: string; readonly session: AuthSession; readonly copy: EditorCopy }

export function SceneRenderVersions({ scene, storyId, session, copy }: Props) {
  const versions = useSceneRenderVersions(scene, storyId, session);
  const statuses = { queued: copy.versionQueued, running: copy.renderingScene, ready: copy.versionReady, failed: copy.versionFailed, canceled: copy.versionFailed };
  const modes = { video: "MP4", audio: "M4A", combined: copy.downloadCombined };
  return <section className={styles.versions} aria-label={copy.renderVersions}>
    <h4>{copy.renderVersions}</h4>
    <p>{copy.renderVersionsHint}</p>
    {versions.isPending && <p role="status">{copy.versionLoading}</p>}
    {versions.isError && <p role="alert">{copy.versionLoadError}</p>}
    {!versions.isError && versions.data?.length === 0 && <p>{copy.versionEmpty}</p>}
    {!versions.isError && <ul>{versions.data?.map((version) => <li key={version.id}>
      <div className={styles.heading}>
        <span>{modes[version.mode]} · <code title={version.inputHash}>{version.inputHash.slice(0, 10)}</code></span>
        <span className={version.current ? styles.current : styles.stale}>{version.current ? copy.versionCurrent : copy.versionStale}</span>
      </div>
      <p>{statuses[version.status]}</p>
      {version.createdAt && <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString()}</time>}
      <details>
        <summary>{copy.versionDetails}</summary>
        {version.contentHash && <p>SHA-256: <code>{version.contentHash}</code></p>}
        <pre>{JSON.stringify({ parameters: version.parameters, dependencies: version.dependencies }, null, 2)}</pre>
      </details>
    </li>)}</ul>}
  </section>;
}
