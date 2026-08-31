import type { ComponentType } from "react";
import type { SceneRendererSettingsProps } from "./SceneRenderer.js";
import {
  collageCardMaterials, getSelectedCollageLayout, resolveCollageSettings, type CollageLayoutEditorId,
} from "@storyteller/domain";
import {
  PaperCascadeCollageEditor, PaperRowsCollageEditor, PaperStackCollageEditor,
} from "./CollageRendererSettings.js";
import { SceneDurationControl } from "./SceneDurationControl.js";

const collageEditors: Readonly<Record<CollageLayoutEditorId, ComponentType<SceneRendererSettingsProps>>> = {
  "paper-stack": PaperStackCollageEditor,
  "paper-rows": PaperRowsCollageEditor,
  "paper-cascade": PaperCascadeCollageEditor,
};

export function LayoutRendererSettings(props: SceneRendererSettingsProps) {
  const { scene, copy, saving, onChange } = props;
  if (scene.rendererId === "collage") {
    const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
    const layout = getSelectedCollageLayout(collageCardMaterials(scene.materials, settings), scene.layoutId);
    if (!layout) return <SceneDurationControl
      durationSeconds={scene.durationSeconds}
      copy={copy}
      saving={saving}
      onCommit={(durationSeconds) => onChange({ durationSeconds })}
    />;
    const Editor = collageEditors[layout.editorId];
    return <Editor {...props} />;
  }
  return <SceneDurationControl
    durationSeconds={scene.durationSeconds}
    copy={copy}
    saving={saving}
    onCommit={(durationSeconds) => onChange({ durationSeconds })}
  />;
}
