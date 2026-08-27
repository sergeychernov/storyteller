import type { Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialogButton } from "./MiniDialogButton.js";
import styles from "./SceneDebugButton.module.css";

export function SceneDebugButton({ scene, copy }: { readonly scene: Scene; readonly copy: EditorCopy }) {
  return <MiniDialogButton code="{}" label={copy.sceneDebug} title={copy.sceneDebug} closeLabel={copy.close}>
    <pre className={styles.json}>{JSON.stringify(scene, null, 2)}</pre>
  </MiniDialogButton>;
}
