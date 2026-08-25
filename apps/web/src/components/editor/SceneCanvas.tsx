import type { CSSProperties } from "react";
import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";

interface SceneCanvasProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
}

export function SceneCanvas({ scene, copy, storyId, session }: SceneCanvasProps) {
  return (
    <div className={`scene-canvas layout-${scene.layoutId ?? "auto"}`}>
      {scene.materials.length ? scene.materials.map((material, index) => (
        <div className={`preview-material ${material.orientation}`} key={material.id} style={{ "--material-index": index } as CSSProperties}>
          <MaterialThumbnail storyId={storyId} material={material} session={session} />
          <span>{material.kind === "video" ? "▶" : "◫"}</span>
          <small>{material.name}</small>
        </div>
      )) : <div className="preview-empty"><span>＋</span>{copy.emptyScene}</div>}
      <div className="preview-time"><i style={{ width: `${scene.durationSeconds / 15 * 100}%` }} /></div>
    </div>
  );
}
