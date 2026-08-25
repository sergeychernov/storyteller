import type { Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialogButton } from "./MiniDialogButton.js";

export function SceneDebugButton({ scene, copy }: { readonly scene: Scene; readonly copy: EditorCopy }) {
  return <MiniDialogButton code="d" label={copy.sceneDebug} title={copy.sceneDebug} closeLabel={copy.close}>
    <pre className="scene-json">{JSON.stringify(scene, null, 2)}</pre>
  </MiniDialogButton>;
}
