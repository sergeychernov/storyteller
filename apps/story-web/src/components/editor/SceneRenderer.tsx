import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef,
  type ComponentType, type ForwardRefExoticComponent, type RefAttributes,
} from "react";
import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { LayoutRendererPreview } from "./LayoutRendererPreview.js";
import { LayoutRendererSettings } from "./LayoutRendererSettings.js";
import { resolveEditorRenderer, type EditorRendererKind } from "./scene-renderer-model.js";
import type { SceneChange } from "./story-editor-view.js";
import { StillImageRendererPreview } from "./StillImageRendererPreview.js";
import { StillImageRendererSettings } from "./StillImageRendererSettings.js";
import type { ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";

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

interface SceneRendererDefinition {
  readonly Preview: ForwardRefExoticComponent<SceneRendererPreviewProps & RefAttributes<ScenePreviewLifecycle>>;
  readonly Settings: ComponentType<SceneRendererSettingsProps>;
}

const sceneRenderers: Readonly<Record<EditorRendererKind, SceneRendererDefinition>> = {
  "still-image": { Preview: StillImageRendererPreview, Settings: StillImageRendererSettings },
  layout: { Preview: LayoutRendererPreview, Settings: LayoutRendererSettings },
};

export const SceneRendererPreview = forwardRef<ScenePreviewLifecycle, SceneRendererPreviewProps>(function SceneRendererPreview(props, ref) {
  const Preview = sceneRenderers[resolveEditorRenderer(props.scene)].Preview;
  const preview = useRef<ScenePreviewLifecycle>(null);
  const initializeScene = useCallback(() => preview.current?.initializeScene(), []);
  useImperativeHandle(ref, () => ({ initializeScene }), [initializeScene]);

  useEffect(() => {
    if (!props.active || props.scene.durationSeconds <= 0) return;
    const interval = window.setInterval(initializeScene, props.scene.durationSeconds * 1_000);
    return () => window.clearInterval(interval);
  }, [initializeScene, props.active, props.scene.durationSeconds, props.scene.id]);

  return <Preview key={`${props.scene.id}:${resolveEditorRenderer(props.scene)}`} ref={preview} {...props} />;
});

export function SceneRendererSettings(props: SceneRendererSettingsProps) {
  const Settings = sceneRenderers[resolveEditorRenderer(props.scene)].Settings;
  return <Settings {...props} />;
}
