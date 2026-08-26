import { getLayoutOptions, materialOrientationSequence } from "@storyteller/domain";
import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneRendererSettings } from "./SceneRenderer.js";
import { isSingleImageScene } from "./scene-renderer-model.js";
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
  const layouts = getLayoutOptions(scene.materials);
  const singleImage = isSingleImageScene(scene);
  return (
    <div className={classNames(styles.panel, variant === "desktop" && styles.desktop)}>
      {singleImage && <SingleImageRendererSelector copy={copy} />}
      {!singleImage && <section><div className={styles.heading}><div><h2>{copy.layout}</h2><small>{copy.layoutHint}</small></div><code>{materialOrientationSequence(scene.materials) || "—"}</code></div>
        <div className={styles.layoutOptions}>{layouts.map((layout) => <button className={scene.layoutId === layout.id || (!scene.layoutId && layouts[0]?.id === layout.id) ? styles.active : undefined} disabled={saving} key={layout.id} onClick={() => onChange({ layoutId: layout.id })}><span className={classNames(styles.layoutGlyph, glyphClassName(layout.id))}><i /><i /><i /><i /></span><strong>{layout.label}</strong><small>{layout.description}</small></button>)}</div>
      </section>}
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

function glyphClassName(layoutId: string): string | undefined {
  if (layoutId === "stack") return styles.glyphStack;
  if (layoutId === "2+1") return styles.glyphTwoOne;
  if (layoutId === "2+1+2") return styles.glyphTwoOneTwo;
  if (layoutId === "2+2+1") return styles.glyphTwoTwoOne;
  if (layoutId === "overlap-stack") return styles.glyphOverlap;
  return undefined;
}
