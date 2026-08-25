import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialActions } from "./MaterialActions.js";
import { MaterialDragGhost } from "./MaterialDragGhost.js";
import { MaterialUploader } from "./MaterialUploader.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { SceneDebugButton } from "./SceneDebugButton.js";
import { useMaterialDrag } from "./use-material-drag.js";

interface MaterialTimelineProps {
  readonly scene: Scene; readonly copy: EditorCopy; readonly saving: boolean; readonly uploading: boolean; readonly uploadCount: number;
  readonly storyId: string; readonly session: AuthSession;
  readonly onUpload: (files: readonly File[]) => void; readonly onReorder: (ids: readonly string[]) => void;
}

export function MaterialTimeline({ scene, copy, saving, uploading, uploadCount, storyId, session, onUpload, onReorder }: MaterialTimelineProps) {
  const materials = scene.materials;
  const { orderedMaterials, draggingId, dragVisual, stripRef, startDrag, moveWithKeyboard } = useMaterialDrag({ materials, saving, onReorder });

  return (
    <section className="material-section">
      <div className="editor-section-head"><h2>{copy.materials}</h2><div className="material-section-actions"><SceneDebugButton scene={scene} copy={copy} /><MaterialUploader copy={copy} disabled={saving} uploading={uploading} uploadCount={uploadCount} onUpload={onUpload} /></div></div>
      <div className="material-strip" ref={stripRef}>
        {orderedMaterials.map((material, index) => (
          <article
            className={`material-card ${material.orientation} ${draggingId === material.id ? "dragging" : ""} ${saving ? "disabled" : ""}`}
            data-material-id={material.id} key={material.id} tabIndex={saving ? -1 : 0}
            aria-label={copy.dragMaterial.replace("{{number}}", String(index + 1))} title={copy.dragMaterialHint}
            onPointerDown={(event) => {
              if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
              if (event.target instanceof Element && event.target.closest("button")) return;
              startDrag(event, material);
            }}
            onKeyDown={(event) => {
              if (event.currentTarget !== event.target || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
              event.preventDefault();
              moveWithKeyboard(material.id, event.key === "ArrowLeft" ? -1 : 1);
            }}
          >
            <div className={`material-thumb ${material.orientation}`}>
              <MaterialThumbnail storyId={storyId} material={material} session={session} />
              <MaterialActions material={material} copy={copy} />
            </div>
          </article>
        ))}
      </div>
      {dragVisual && <MaterialDragGhost {...dragVisual} storyId={storyId} session={session} />}
    </section>
  );
}
