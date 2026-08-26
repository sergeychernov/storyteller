import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneRendererPreview } from "./SceneRenderer.js";
import styles from "./SceneCanvas.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface SceneCanvasProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly presentation: "carousel" | "desktop";
  readonly adjacent?: "previous" | "next" | undefined;
  readonly dimmed?: boolean;
  readonly inactive?: boolean;
  readonly saving?: boolean;
  readonly onChange?: ((change: SceneChange) => void) | undefined;
}

export function SceneCanvas({
  scene, copy, storyId, session, presentation, adjacent, dimmed = false, inactive = false, saving = false, onChange,
}: SceneCanvasProps) {
  return (
    <div className={classNames(
      styles.canvasSlot,
      adjacent && styles[adjacent],
      dimmed && styles.dimmed,
      inactive && styles.inactive,
    )}>
      <div className={classNames(
        styles.canvas,
        (scene.layoutId === "full-frame" || scene.materials.length === 1) && styles.fullFrame,
        scene.layoutId === "overlap-stack" && styles.overlapStack,
        styles[presentation],
      )}>
        <SceneRendererPreview
          scene={scene}
          copy={copy}
          storyId={storyId}
          session={session}
          active={!inactive && !dimmed}
          saving={saving}
          onChange={inactive || dimmed ? undefined : onChange}
        />
      </div>
    </div>
  );
}
