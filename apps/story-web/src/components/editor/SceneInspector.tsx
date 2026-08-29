import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneRendererSettings } from "./SceneRenderer.js";
import { isSingleImageScene, isSingleVideoScene } from "./scene-renderer-model.js";
import { SceneLayoutSelector } from "./SceneLayoutSelector.js";
import { SingleImageRendererSelector } from "./SingleImageRendererSelector.js";
import styles from "./SceneInspector.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface SceneInspectorProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly variant?: "default" | "desktop";
  readonly onChange: (change: SceneChange) => void;
}

export function SceneInspector({ scene, copy, saving, storyId, session, variant = "default", onChange }: SceneInspectorProps) {
  if (isSingleVideoScene(scene)) return null;
  const singleImage = isSingleImageScene(scene);
  return (
    <div className={classNames(styles.panel, variant === "desktop" && styles.desktop)}>
      {singleImage && <SingleImageRendererSelector copy={copy} />}
      {!singleImage && <SceneLayoutSelector scene={scene} copy={copy} saving={saving} onChange={onChange} />}
      {scene.materials.length > 0 && <SceneRendererSettings
        scene={scene}
        copy={copy}
        storyId={storyId}
        session={session}
        saving={saving}
        onChange={onChange}
      />}
    </div>
  );
}
