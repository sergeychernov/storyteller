import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneCanvas } from "./SceneCanvas.js";

export function ScenePreview({ scene, copy, storyId, session }: { readonly scene: Scene; readonly copy: EditorCopy; readonly storyId: string; readonly session: AuthSession }) {
  return (
    <section className="scene-preview-panel">
      <div className="preview-label"><span>{copy.preview}</span><span>9:16 · {scene.durationSeconds} {copy.seconds}</span></div>
      <SceneCanvas scene={scene} copy={copy} storyId={storyId} session={session} />
    </section>
  );
}
