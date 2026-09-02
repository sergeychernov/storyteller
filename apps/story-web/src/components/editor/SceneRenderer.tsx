import { forwardRef, useEffect, useState, type ComponentType } from "react";
import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { FocusPointEditor } from "./FocusPointEditor.js";
import { LayoutRendererSettings } from "./LayoutRendererSettings.js";
import { resolveEditorRenderer, type EditorRendererKind } from "./scene-renderer-model.js";
import { ScenePlayer } from "./ScenePlayer.js";
import type { SceneChange } from "./story-editor-view.js";
import { StillImageRendererSettings } from "./StillImageRendererSettings.js";
import { useScenePreviewInitialization, type ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import { useLoopingSceneTime } from "./use-looping-scene-time.js";
import { useMediaQuery } from "./use-media-query.js";
import styles from "./SceneCanvas.module.css";

export interface SceneRendererPreviewProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly active: boolean;
  readonly saving: boolean;
  readonly onChange?: ((change: SceneChange) => void) | undefined;
}

export interface SceneRendererSettingsProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly saving: boolean;
  readonly onChange: (change: SceneChange) => void;
}

const settingsByRenderer: Readonly<Record<EditorRendererKind, ComponentType<SceneRendererSettingsProps>>> = {
  "still-image": StillImageRendererSettings,
  layout: LayoutRendererSettings,
};

/** Editor policy around the same ScenePlayer used by continuous story preview. */
export const SceneRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function SceneRendererPreview(
  props,
  ref,
) {
  const generation = useScenePreviewInitialization(ref);
  const [playing, setPlaying] = useState(true);
  useEffect(() => setPlaying(true), [generation, props.scene.id]);
  const localTimeSeconds = useLoopingSceneTime(props.active && playing, props.scene.durationSeconds, generation);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (!props.scene.materials.length) return <div className={styles.empty}><span>＋</span>{props.copy.emptyScene}</div>;
  return <ScenePlayer
    key={generation}
    scene={props.scene}
    previousScene={props.previousScene}
    copy={props.copy}
    storyId={props.storyId}
    session={props.session}
    localTimeSeconds={localTimeSeconds}
    playing={props.active && playing}
    active={props.active}
    muted
    reducedMotion={reducedMotion}
    preload={props.active ? "auto" : "metadata"}
    retryKey={generation}
    editorMediaControls={{ onTogglePlayback: () => setPlaying((current) => !current) }}
    renderSlotOverlay={(slot) => slot.role === "still-image" && props.onChange ? <FocusPointEditor
      focusPoint={props.scene.focusPoint ?? { x: 0.5, y: 0.5 }}
      label={props.copy.moveFocusPoint}
      disabled={props.saving}
      onCommit={(focusPoint) => props.onChange?.({ focusPoint })}
    /> : undefined}
  />;
});

export function SceneRendererSettings(props: SceneRendererSettingsProps) {
  const Settings = settingsByRenderer[resolveEditorRenderer(props.scene)];
  return <Settings {...props} />;
}
