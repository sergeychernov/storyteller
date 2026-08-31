import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { useSceneRenderResults } from "./use-scene-render-results.js";
import styles from "./SceneDebugData.module.css";

interface Props { readonly scene: Scene; readonly storyId: string; readonly session: AuthSession; readonly copy: EditorCopy }

export function SceneDebugData({ scene, storyId, session, copy }: Props) {
  const results = useSceneRenderResults(scene, storyId, session);
  const data = { ...scene, renderResults: results.isSuccess ? results.data : null };
  return <>
    {results.isPending && <p role="status">{copy.renderResultsLoading}</p>}
    {results.isError && <p role="alert">{copy.renderResultsLoadError}</p>}
    <pre className={styles.json}>{JSON.stringify(data, null, 2)}</pre>
  </>;
}
