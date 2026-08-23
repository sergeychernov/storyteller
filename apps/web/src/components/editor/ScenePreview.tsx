import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";

export function ScenePreview({ scene, copy, storyId, session }: { readonly scene: Scene; readonly copy: EditorCopy; readonly storyId: string; readonly session: AuthSession }) {
  return (
    <section className="scene-preview-panel">
      <div className="preview-label"><span>{copy.preview}</span><span>9:16 · {scene.durationSeconds} {copy.seconds}</span></div>
      <div className={`scene-canvas layout-${scene.layoutId ?? "auto"}`}>
        {scene.materials.length ? scene.materials.map((material, index) => (
          <div className={`preview-material ${material.orientation}`} key={material.id} style={{ "--material-index": index } as React.CSSProperties}>
            <MaterialThumbnail storyId={storyId} material={material} session={session} /><span>{material.kind === "video" ? "▶" : "◫"}</span><small>{material.name}</small>
          </div>
        )) : <div className="preview-empty"><span>＋</span>{copy.emptyScene}</div>}
        <div className="preview-time"><i style={{ width: `${scene.durationSeconds / 15 * 100}%` }} /></div>
      </div>
    </section>
  );
}
