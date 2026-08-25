import type { SceneMaterial } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialogButton } from "./MiniDialogButton.js";

export function MaterialActions({ material, copy }: { readonly material: SceneMaterial; readonly copy: EditorCopy }) {
  const audio = material.kind === "video"
    ? material.audioTags.length ? material.audioTags.map((tag) => copy[tag]).join(", ") : material.hasAudio ? copy.audioUnclassified : copy.silent
    : undefined;

  return <div className="material-actions">
    <MiniDialogButton code="i" label={copy.fileInfo} title={copy.fileInfo} closeLabel={copy.close}>
      <dl className="file-details">
        <div><dt>{copy.fileName}</dt><dd>{material.name}</dd></div>
        <div><dt>{copy.fileSize}</dt><dd>{formatFileSize(material.sizeBytes)}</dd></div>
        <div><dt>{copy.fileFormat}</dt><dd>{material.mimeType}</dd></div>
        <div><dt>{copy.fileDimensions}</dt><dd>{material.width} × {material.height}</dd></div>
        {material.kind === "video" && <div><dt>{copy.fileDuration}</dt><dd>{material.sourceDurationSeconds === undefined ? "—" : formatDuration(material.sourceDurationSeconds)}</dd></div>}
        {audio && <div><dt>{copy.sourceAudio}</dt><dd>{audio}</dd></div>}
      </dl>
    </MiniDialogButton>
    <MiniDialogButton code="e" label={copy.editMaterial} title={copy.editMaterial} closeLabel={copy.close}>
      <div className="future-tools">
        <button type="button" disabled>{copy.cropMaterial}</button>
        {material.kind === "video" && <button type="button" disabled>{copy.trimMaterial}</button>}
        <small>{copy.materialEditorHint}</small>
      </div>
    </MiniDialogButton>
  </div>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `0:${String(remainder).padStart(2, "0")}`;
}
