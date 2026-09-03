import type { AuthSession, MaterialEdit, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialTimeline } from "./MaterialTimeline.js";
import { SceneInspector } from "./SceneInspector.js";
import { SceneTitlePanel } from "./SceneTitlePanel.js";
import { isSingleVideoScene } from "./scene-renderer-model.js";
import styles from "./SceneEditorTabs.module.css";
import type { SceneChange } from "./story-editor-view.js";
import type { SceneTitleEditorController } from "./use-scene-title-editor.js";

interface SceneEditorTabsProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly uploading: boolean;
  readonly backgroundUploading: boolean;
  readonly uploadCount: number;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly onUpload: (files: readonly File[]) => void;
  readonly onUploadBackground: (file: File) => void;
  readonly onRemoveBackground: () => void;
  readonly onDeleteMaterial: (materialId: string) => void;
  readonly onMoveMaterial: (sourceSceneId: string, materialId: string, targetSceneId: string) => void;
  readonly onEditMaterial: (materialId: string, edit: MaterialEdit) => Promise<void>;
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onChange: (change: SceneChange) => void;
  readonly activeTab: EditorTab;
  readonly onActiveTabChange: (tab: EditorTab) => void;
  readonly titleEditor: SceneTitleEditorController;
}

export type EditorTab = "materials" | "composition" | "titles";

export function SceneEditorTabs({
  scene, previousScene, copy, saving, uploading, backgroundUploading, uploadCount, storyId, session,
  onUpload, onUploadBackground, onRemoveBackground, onDeleteMaterial, onMoveMaterial, onEditMaterial, onReorder, onChange,
  activeTab, onActiveTabChange, titleEditor,
}: SceneEditorTabsProps) {
  const singleVideo = isSingleVideoScene(scene);
  const visibleTab = singleVideo && activeTab === "composition" ? "materials" : activeTab;
  const tabs: readonly { id: EditorTab; label: string }[] = [
    { id: "materials", label: `${copy.materials} · ${scene.materials.length}` },
    ...(!singleVideo ? [{ id: "composition" as const, label: copy.layout }] : []),
    { id: "titles", label: `${copy.titles} · ${scene.title ? 1 : 0}` },
  ];
  return (
    <section className={styles.shell}>
      <div className={styles.grabber} />
      <div className={styles.tabs} role="tablist" aria-label={copy.sceneTools} style={{ "--tab-count": tabs.length } as React.CSSProperties}>
        {tabs.map((tab) => <button
          type="button"
          role="tab"
          id={`scene-tab-${tab.id}`}
          aria-controls={`scene-panel-${tab.id}`}
          aria-selected={visibleTab === tab.id}
          key={tab.id}
          onClick={() => onActiveTabChange(tab.id)}
        >{tab.label}</button>)}
      </div>
      <div
        className={styles.content}
        role="tabpanel"
        id={`scene-panel-${visibleTab}`}
        aria-labelledby={`scene-tab-${visibleTab}`}
      >
        {visibleTab === "materials" && <MaterialTimeline
          scene={scene}
          previousScene={previousScene}
          copy={copy}
          saving={saving}
          storyId={storyId}
          session={session}
          uploading={uploading}
          backgroundUploading={backgroundUploading}
          uploadCount={uploadCount}
          variant="mobilePanel"
          onUpload={onUpload}
          onUploadBackground={onUploadBackground}
          onRemoveBackground={onRemoveBackground}
          onDeleteMaterial={onDeleteMaterial}
          onMoveToScene={onMoveMaterial}
          onEditMaterial={onEditMaterial}
          onReorder={onReorder}
        />}
        {visibleTab === "composition" && <SceneInspector scene={scene} copy={copy} saving={saving} storyId={storyId} session={session} onChange={onChange} />}
        {visibleTab === "titles" && <SceneTitlePanel scene={scene} copy={copy} editor={titleEditor} variant="mobile" />}
      </div>
    </section>
  );
}
