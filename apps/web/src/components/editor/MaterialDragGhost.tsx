import { createPortal } from "react-dom";
import type { AuthSession, SceneMaterial } from "../../api.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";

interface MaterialDragGhostProps {
  readonly material: SceneMaterial;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly dropping: boolean;
}

export function MaterialDragGhost({ material, storyId, session, x, y, offsetX, offsetY, width, height, dropping }: MaterialDragGhostProps) {
  return createPortal(
    <article
      aria-hidden="true"
      className={`material-drag-ghost ${dropping ? "dropping" : ""}`}
      style={{ width, height, transform: `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) scale(${dropping ? 1 : 1.03})` }}
    >
      <div className={`material-thumb ${material.orientation}`}>
        <MaterialThumbnail storyId={storyId} material={material} session={session} />
      </div>
    </article>,
    document.body,
  );
}
