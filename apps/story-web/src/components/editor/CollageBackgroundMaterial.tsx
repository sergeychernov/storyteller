import type { AuthSession, Scene } from "../../api.js";
import { useCapability } from "../../access-control.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { useSceneFrameUrl } from "./use-scene-frame-url.js";
import styles from "./CollageBackgroundMaterial.module.css";

interface CollageBackgroundMaterialProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly disabled: boolean;
  readonly uploading: boolean;
  readonly onUpload: (file: File) => void;
  readonly onRemove: () => void;
}

export function CollageBackgroundMaterial({
  scene, previousScene, copy, storyId, session, disabled, uploading, onUpload, onRemove,
}: CollageBackgroundMaterialProps) {
  const canUpload = useCapability("media.upload");
  const custom = scene.collageBackground?.source === "material" ? scene.collageBackground.material : undefined;
  const label = custom ? copy.backgroundCustom : copy.backgroundPrevious;
  return <article className={classNames(styles.card, disabled && styles.disabled, uploading && styles.loading)}
    data-collage-background-source={custom ? "material" : "previous-scene"}>
    <span className={styles.badge}>{copy.collageBackground}</span>
    <div className={styles.preview}>
      {custom
        ? <MaterialThumbnail storyId={storyId} material={custom} session={session} presentation="timeline" />
        : previousScene
          ? <PreviousSceneThumbnail scene={previousScene} storyId={storyId} session={session} />
          : <span className={styles.placeholder} aria-hidden="true">◫</span>}
    </div>
    <strong>{uploading ? copy.uploadingBackground : label}</strong>
    {custom && <button type="button" className={styles.remove} disabled={disabled}
      aria-label={copy.removeBackground} title={copy.removeBackground} onClick={onRemove}>×</button>}
    {canUpload && <input
      className={styles.fileInput}
      type="file"
      aria-label={custom ? copy.replaceBackground : copy.uploadBackground}
      title={custom ? copy.replaceBackground : copy.uploadBackground}
      accept="image/*,video/*"
      disabled={disabled}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onUpload(file);
        event.target.value = "";
      }}
    />}
  </article>;
}

function PreviousSceneThumbnail({ scene, storyId, session }: {
  readonly scene: Scene; readonly storyId: string; readonly session: AuthSession;
}) {
  const frame = useSceneFrameUrl(scene, storyId, session);
  return frame.url
    ? <img src={frame.url} alt="" draggable={false} />
    : <span className={styles.placeholder} aria-hidden="true">◫</span>;
}
