import { useEffect, useState } from "react";
import type { Scene } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneInspector } from "./SceneInspector.js";
import type { SceneChange } from "./story-editor-view.js";

interface DesktopSceneInspectorProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly compact: boolean;
  readonly onChange: (change: SceneChange) => void;
}

type InspectorTab = "layout" | "motion";

export function DesktopSceneInspector({ scene, copy, saving, compact, onChange }: DesktopSceneInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("layout");
  const [open, setOpen] = useState(false);
  const tabs: readonly { id: InspectorTab; label: string }[] = [
    { id: "layout", label: copy.layout },
    { id: "motion", label: copy.motion },
  ];

  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!compact || !open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compact, open]);

  if (compact && !open) return (
    <aside className="desktop-scene-inspector compact collapsed" aria-label={copy.sceneTools}>
      <div className="desktop-inspector-rail">
        <button type="button" aria-label={copy.layout} title={copy.layout} onClick={() => { setActiveTab("layout"); setOpen(true); }}>▦</button>
        <button type="button" aria-label={copy.motion} title={copy.motion} onClick={() => { setActiveTab("motion"); setOpen(true); }}>↗</button>
      </div>
    </aside>
  );

  return (
    <aside className={`desktop-scene-inspector${compact ? " compact open" : ""}`}>
      <div className={`desktop-inspector-head${compact ? " with-close" : ""}`}>
        <div className="desktop-inspector-tabs" role="tablist" aria-label={copy.sceneTools}>
          {tabs.map((tab) => <button
            type="button"
            role="tab"
            id={`desktop-inspector-tab-${tab.id}`}
            aria-controls={`desktop-inspector-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >{tab.label}</button>)}
        </div>
        {compact && <button type="button" className="desktop-inspector-close" aria-label={copy.close} onClick={() => setOpen(false)}>×</button>}
      </div>
      <div
        className="desktop-inspector-content"
        role="tabpanel"
        id={`desktop-inspector-panel-${activeTab}`}
        aria-labelledby={`desktop-inspector-tab-${activeTab}`}
      >
        <SceneInspector scene={scene} copy={copy} saving={saving} panel={activeTab} onChange={onChange} />
      </div>
    </aside>
  );
}
