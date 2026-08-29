import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { useSceneRenderVersions } from "./use-scene-render-versions.js";
import styles from "./SceneDebugData.module.css";

interface Props { readonly scene: Scene; readonly storyId: string; readonly session: AuthSession; readonly copy: EditorCopy }

export function SceneDebugData({ scene, storyId, session, copy }: Props) {
  const versions = useSceneRenderVersions(scene, storyId, session);
  const data = { ...scene, renderVersions: versions.isSuccess ? versions.data : null };
  return <>
    {versions.isPending && <p role="status">{copy.versionLoading}</p>}
    {versions.isError && <p role="alert">{copy.versionLoadError}</p>}
    <pre className={styles.json}>{JSON.stringify(data, null, 2)}</pre>
  </>;
}
