import type { EditorCopy } from "./editor-copy.js";
import { SceneRail } from "./SceneRail.js";

interface EmptyScenePipelineProps {
  readonly copy: EditorCopy;
  readonly creating: boolean;
  readonly error: boolean;
  readonly onCreate: () => void;
}

export function EmptyScenePipeline({ copy, creating, error, onCreate }: EmptyScenePipelineProps) {
  return (
    <div className="story-editor empty-pipeline">
      {error && <div className="editor-operation-error" role="alert">{copy.sceneCreateError}</div>}
      <SceneRail scenes={[]} selectedId="" copy={copy} onSelect={() => undefined} onAdd={onCreate} adding={creating} />
      <main className="editor-workspace">
        <section className="scene-preview-panel">
          <div className="preview-label"><span>{copy.preview}</span><span>9:16</span></div>
          <div className="scene-canvas empty-scene-canvas">
            <span>＋</span><strong>{creating ? copy.creatingScene : copy.emptyPipelineHint}</strong>
          </div>
        </section>
        <section className="material-section empty-material-section">
          <div className="editor-section-head"><h2>{copy.materials}</h2><button className="secondary-button compact" disabled>＋ {copy.addMaterial}</button></div>
          <div className="empty-material-track"><i /><i /><i /></div>
        </section>
      </main>
      <aside className="scene-inspector empty-inspector">
        <section><h2>{copy.layout}</h2><div className="empty-setting"><i /><i /></div></section>
        <section><h2>{copy.motion}</h2><div className="empty-setting motion"><i /><i /><i /></div></section>
        <section><div className="duration-value"><h2>{copy.duration}</h2><strong>—</strong></div><div className="empty-duration" /></section>
      </aside>
    </div>
  );
}
