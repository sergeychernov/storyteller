import type { ComponentType } from "react";
import type { AuthSession, Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { LayoutRendererPreview } from "./LayoutRendererPreview.js";
import { LayoutRendererSettings } from "./LayoutRendererSettings.js";
import { resolveEditorRenderer, type EditorRendererKind } from "./scene-renderer-model.js";
import type { SceneChange } from "./story-editor-view.js";
import { StillImageRendererPreview } from "./StillImageRendererPreview.js";
import { StillImageRendererSettings } from "./StillImageRendererSettings.js";

export interface SceneRendererPreviewProps {
  readonly scene: Scene;
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
  readonly Preview: ComponentType<SceneRendererPreviewProps>;
  readonly Settings: ComponentType<SceneRendererSettingsProps>;
}

const sceneRenderers: Readonly<Record<EditorRendererKind, SceneRendererDefinition>> = {
  "still-image": { Preview: StillImageRendererPreview, Settings: StillImageRendererSettings },
  layout: { Preview: LayoutRendererPreview, Settings: LayoutRendererSettings },
};

export function SceneRendererPreview(props: SceneRendererPreviewProps) {
  const Preview = sceneRenderers[resolveEditorRenderer(props.scene)].Preview;
  return <Preview {...props} />;
}

export function SceneRendererSettings(props: SceneRendererSettingsProps) {
  const Settings = sceneRenderers[resolveEditorRenderer(props.scene)].Settings;
  return <Settings {...props} />;
}
