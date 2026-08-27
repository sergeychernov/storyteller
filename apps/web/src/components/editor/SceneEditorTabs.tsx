import { useState } from "react";
import type { AuthSession, MaterialEdit, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneInspector } from "./SceneInspector.js";
import { isSingleVideoScene } from "./scene-renderer-model.js";
import styles from "./SceneEditorTabs.module.css";
import type { SceneChange } from "./story-editor-view.js";

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
  readonly onEditMaterial: (materialId: string, edit: MaterialEdit) => Promise<void>;
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onChange: (change: SceneChange) => void;
}

type EditorTab = "materials" | "composition";

export function SceneEditorTabs({
  scene, copy, saving, uploading, uploadCount, storyId, session,
  onUpload, onDeleteMaterial, onEditMaterial, onReorder, onChange,
}: SceneEditorTabsProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("materials");
  const singleVideo = isSingleVideoScene(scene);
  const visibleTab = singleVideo ? "materials" : activeTab;
  const tabs: readonly { id: EditorTab; label: string }[] = [
    { id: "materials", label: `${copy.materials} · ${scene.materials.length}` },
    { id: "composition", label: copy.layout },
  ];
  return (
    <section className={classNames(styles.shell, singleVideo && styles.materialsOnly)}>
      <div className={styles.grabber} />
      {singleVideo ? <h2 className={styles.materialsHeading} id="scene-materials-heading">
        {copy.materials} · {scene.materials.length}
      </h2> : <div className={styles.tabs} role="tablist" aria-label={copy.sceneTools}>
        {tabs.map((tab) => <button
          type="button"
          role="tab"
          id={`scene-tab-${tab.id}`}
          aria-controls={`scene-panel-${tab.id}`}
          aria-selected={visibleTab === tab.id}
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
        >{tab.label}</button>)}
      </div>}
      <div
        className={styles.content}
        role={singleVideo ? "region" : "tabpanel"}
        id={`scene-panel-${visibleTab}`}
        aria-labelledby={singleVideo ? "scene-materials-heading" : `scene-tab-${visibleTab}`}
      >
        {visibleTab === "materials" && <MaterialTimeline
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
          onEditMaterial={onEditMaterial}
          onReorder={onReorder}
        />}
        {visibleTab === "composition" && <SceneInspector scene={scene} copy={copy} saving={saving} storyId={storyId} session={session} onChange={onChange} />}
      </div>
    </section>
  );
}
