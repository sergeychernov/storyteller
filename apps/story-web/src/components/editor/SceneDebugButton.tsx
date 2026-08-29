import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialogButton } from "./MiniDialogButton.js";
import { SceneDebugData } from "./SceneDebugData.js";
import { useCapability } from "../../access-control.js";

interface Props { readonly scene: Scene; readonly storyId: string; readonly session: AuthSession; readonly copy: EditorCopy }

export function SceneDebugButton({ scene, storyId, session, copy }: Props) {
  const canRender = useCapability("scene.render");
  if (!canRender) return null;
  return <MiniDialogButton code="{}" label={copy.sceneDebug} title={copy.sceneDebug} closeLabel={copy.close}>
    <SceneDebugData scene={scene} storyId={storyId} session={session} copy={copy} />
  </MiniDialogButton>;
}
