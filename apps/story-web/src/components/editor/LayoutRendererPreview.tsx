import type { CSSProperties } from "react";
import { getMaterialPresentation } from "../../api.js";
import { classNames } from "../../class-names.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import { VideoMaterialPreview } from "./VideoMaterialPreview.js";
import type { SceneRendererPreviewProps } from "./SceneRenderer.js";
import styles from "./SceneCanvas.module.css";

export function LayoutRendererPreview({ scene, copy, storyId, session, active }: SceneRendererPreviewProps) {
  return scene.materials.length ? scene.materials.map((material, index) => (
    <div
      className={classNames(styles.material, styles[getMaterialPresentation(material).orientation])}
      key={material.id}
      style={{ "--material-index": index } as CSSProperties}
    >
      {material.kind === "video"
        ? <VideoMaterialPreview storyId={storyId} material={material} session={session} active={active} copy={copy} />
        : <MaterialThumbnail storyId={storyId} material={material} session={session} presentation="preview" />}
    </div>
  )) : <div className={styles.empty}><span>＋</span>{copy.emptyScene}</div>;
}
