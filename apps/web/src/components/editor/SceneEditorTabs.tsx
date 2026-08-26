import { useState } from "react";
import type { AuthSession, Scene, SceneMotion } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneInspector } from "./SceneInspector.js";
import styles from "./SceneEditorTabs.module.css";

interface SceneEditorTabsProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly uploading: boolean;
  readonly uploadCount: number;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly onUpload: (files: readonly File[]) => void;
  readonly onDeleteMaterial: (materialId: string) => void;
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onChange: (change: { durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion }) => void;
}

type EditorTab = "materials" | "layout" | "motion";

export function SceneEditorTabs({ scene, copy, saving, uploading, uploadCount, storyId, session, onUpload, onDeleteMaterial, onReorder, onChange }: SceneEditorTabsProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("materials");
  const tabs: readonly { id: EditorTab; label: string }[] = [
    { id: "materials", label: `${copy.materials} · ${scene.materials.length}` },
    { id: "layout", label: copy.layout },
    { id: "motion", label: copy.motion },
  ];
  return (
    <section className={styles.shell}>
      <div className={styles.grabber} />
      <div className={styles.tabs} role="tablist" aria-label={copy.sceneTools}>
        {tabs.map((tab) => <button
          type="button"
          role="tab"
          id={`scene-tab-${tab.id}`}
          aria-controls={`scene-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
        >{tab.label}</button>)}
      </div>
      <div className={styles.content} role="tabpanel" id={`scene-panel-${activeTab}`} aria-labelledby={`scene-tab-${activeTab}`}>
        {activeTab === "materials" && <MaterialTimeline
          scene={scene}
          copy={copy}
          saving={saving}
          storyId={storyId}
          session={session}
          uploading={uploading}
          uploadCount={uploadCount}
          variant="mobilePanel"
          onUpload={onUpload}
          onDeleteMaterial={onDeleteMaterial}
          onReorder={onReorder}
        />}
        {activeTab === "layout" && <SceneInspector scene={scene} copy={copy} saving={saving} panel="layout" onChange={onChange} />}
        {activeTab === "motion" && <SceneInspector scene={scene} copy={copy} saving={saving} panel="motion" onChange={onChange} />}
      </div>
    </section>
  );
}
