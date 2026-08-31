import { getMaterialPresentation, type AuthSession, type MaterialEdit, type Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialActions } from "./MaterialActions.js";
import { MaterialDragGhost } from "./MaterialDragGhost.js";
import { MaterialUploader } from "./MaterialUploader.js";
import { CollageBackgroundMaterial } from "./CollageBackgroundMaterial.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import styles from "./MaterialTimeline.module.css";
import { useMaterialDrag } from "./use-material-drag.js";
import { preventNativeMediaAction } from "./NativeDragSafeVideo.js";

interface MaterialTimelineProps {
  readonly scene: Scene; readonly previousScene?: Scene | undefined; readonly copy: EditorCopy; readonly saving: boolean; readonly uploading: boolean;
  readonly backgroundUploading: boolean; readonly uploadCount: number;
  readonly storyId: string; readonly session: AuthSession;
  readonly variant: "default" | "mobilePanel" | "desktopPanel";
  readonly onUpload: (files: readonly File[]) => void; readonly onDeleteMaterial: (materialId: string) => void;
  readonly onUploadBackground: (file: File) => void; readonly onRemoveBackground: () => void;
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onMoveToScene: (sourceSceneId: string, materialId: string, targetSceneId: string) => void;
  readonly onEditMaterial: (materialId: string, edit: MaterialEdit) => Promise<void>;
}

export function MaterialTimeline({
  scene, previousScene, copy, saving, uploading, backgroundUploading, uploadCount, storyId, session, variant,
  onUpload, onUploadBackground, onRemoveBackground, onDeleteMaterial, onReorder, onMoveToScene, onEditMaterial,
}: MaterialTimelineProps) {
  const materials = scene.materials;
  const { orderedMaterials, draggingId, dragVisual, stripRef, startDrag, moveWithKeyboard } = useMaterialDrag({
    materials,
    sceneId: scene.id,
    saving,
    onReorder,
    onMoveToScene: (materialId, targetSceneId) => onMoveToScene(scene.id, materialId, targetSceneId),
  });

  return (
    <section className={classNames(styles.section, variant !== "default" && styles[variant])}>
      <div className={styles.strip} ref={stripRef}>
        {orderedMaterials.map((material, index) => {
          const orientation = getMaterialPresentation(material).orientation;
          return (
          <article
            className={classNames(
              styles.card,
              styles[orientation],
              draggingId === material.id && styles.dragging,
              saving && styles.disabled,
            )}
            data-material-id={material.id} key={material.id} tabIndex={saving ? -1 : 0}
            aria-label={copy.dragMaterial.replace("{{number}}", String(index + 1))} title={copy.dragMaterialHint}
            onContextMenu={(event) => preventNativeMediaAction(event.nativeEvent)}
            onDragStart={(event) => preventNativeMediaAction(event.nativeEvent)}
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
            <div className={classNames(styles.thumb, styles[orientation])}>
              <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="timeline" />
              <MaterialActions
                material={material}
                copy={copy}
                disabled={saving}
                storyId={storyId}
                session={session}
                onEdit={(edit) => onEditMaterial(material.id, edit)}
                onDelete={() => onDeleteMaterial(material.id)}
              />
            </div>
          </article>
          );
        })}
        {scene.rendererId === "collage" && <CollageBackgroundMaterial
          scene={scene}
          previousScene={previousScene}
          copy={copy}
          storyId={storyId}
          session={session}
          disabled={saving}
          uploading={backgroundUploading}
          onUpload={onUploadBackground}
          onRemove={onRemoveBackground}
        />}
        <MaterialUploader copy={copy} disabled={saving} uploading={uploading} uploadCount={uploadCount} onUpload={onUpload} />
      </div>
      {dragVisual && <MaterialDragGhost {...dragVisual} storyId={storyId} session={session} />}
    </section>
  );
}
