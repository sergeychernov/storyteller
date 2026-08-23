import type { AuthSession, SceneMaterial } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialUploader } from "./MaterialUploader.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";

interface MaterialTimelineProps {
  readonly materials: readonly SceneMaterial[]; readonly copy: EditorCopy; readonly saving: boolean; readonly uploading: boolean; readonly uploadCount: number;
  readonly storyId: string; readonly session: AuthSession;
  readonly onUpload: (files: readonly File[]) => void; readonly onMove: (from: number, to: number) => void;
}

export function MaterialTimeline({ materials, copy, saving, uploading, uploadCount, storyId, session, onUpload, onMove }: MaterialTimelineProps) {
  return (
    <section className="material-section">
      <div className="editor-section-head"><div><h2>{copy.materialOrder}</h2><small>{materials.map(({ orientation }) => orientation === "portrait" ? "P" : "L").join(" · ") || "—"}</small></div><MaterialUploader copy={copy} disabled={saving} uploading={uploading} uploadCount={uploadCount} onUpload={onUpload} /></div>
      <div className="material-strip">
        {materials.map((material, index) => (
          <article className="material-card" key={material.id}>
            <div className={`material-thumb ${material.orientation}`}><MaterialThumbnail storyId={storyId} material={material} session={session} /><b>{index + 1}</b></div>
            <div className="material-meta"><strong>{material.name}</strong><span>{material.orientation === "portrait" ? copy.portrait : copy.landscape}</span>
              {material.kind === "video" && <div className="sound-badges">{material.audioTags.length
                ? material.audioTags.map((tag) => <i key={tag}>{copy[tag]}</i>)
                : <i>{material.hasAudio ? copy.audioUnclassified : copy.silent}</i>}</div>}
            </div>
            <div className="order-controls"><button aria-label="Move left" disabled={!index || saving} onClick={() => onMove(index, index - 1)}>←</button><button aria-label="Move right" disabled={index === materials.length - 1 || saving} onClick={() => onMove(index, index + 1)}>→</button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
