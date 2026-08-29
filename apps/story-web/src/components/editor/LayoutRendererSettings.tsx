import type { SceneRendererSettingsProps } from "./SceneRenderer.js";
import { SceneDurationControl } from "./SceneDurationControl.js";

export function LayoutRendererSettings({ scene, copy, saving, onChange }: SceneRendererSettingsProps) {
  return <SceneDurationControl
    durationSeconds={scene.durationSeconds}
    copy={copy}
    saving={saving}
    onCommit={(durationSeconds) => onChange({ durationSeconds })}
  />;
}
