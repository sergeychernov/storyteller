import { useState } from "react";
import { getMaterialPresentation, type AuthSession, type MaterialEdit, type SceneMaterial } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialEditor } from "./MaterialEditor.js";
import { MiniDialog } from "./MiniDialog.js";
import { PopupMenuButton, type PopupMenuItem } from "./PopupMenuButton.js";
import styles from "./MaterialActions.module.css";

interface MaterialActionsProps {
  readonly material: SceneMaterial;
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly onEdit: (edit: MaterialEdit) => Promise<void>;
  readonly onDelete: () => void;
}

type MaterialDialog = "info" | "edit" | "delete";

export function MaterialActions({ material, copy, disabled, storyId, session, onEdit, onDelete }: MaterialActionsProps) {
  const [dialog, setDialog] = useState<MaterialDialog>();
  const presentation = getMaterialPresentation(material);
  const audio = material.kind === "video"
    ? material.audioTags.length ? material.audioTags.map((tag) => copy[tag]).join(", ") : material.hasAudio ? copy.audioUnclassified : copy.silent
    : undefined;
  const items: readonly PopupMenuItem[] = [
    { id: "edit", label: copy.editMaterial, onSelect: () => setDialog("edit") },
    { id: "info", label: copy.fileInfo, onSelect: () => setDialog("info") },
    { id: "delete", label: copy.deleteMaterial, danger: true, onSelect: () => setDialog("delete") },
  ];

  return <div className={styles.actions}>
    <PopupMenuButton label={copy.materialActions} items={items} disabled={disabled} />
    <MiniDialog open={dialog === "info"} title={copy.fileInfo} closeLabel={copy.close} onClose={() => setDialog(undefined)}>
      <dl className={styles.fileDetails}>
        <div><dt>{copy.fileName}</dt><dd>{material.name}</dd></div>
        <div><dt>{copy.fileSize}</dt><dd>{formatFileSize(presentation.sizeBytes)}</dd></div>
        <div><dt>{copy.fileFormat}</dt><dd>{presentation.mimeType}</dd></div>
        <div><dt>{copy.fileDimensions}</dt><dd>{presentation.width} × {presentation.height}</dd></div>
        {material.kind === "video" && <div><dt>{copy.fileDuration}</dt><dd>{material.sourceDurationSeconds === undefined ? "—" : formatDuration(material.sourceDurationSeconds)}</dd></div>}
        {audio && <div><dt>{copy.sourceAudio}</dt><dd>{audio}</dd></div>}
      </dl>
    </MiniDialog>
    <MiniDialog open={dialog === "edit"} title={copy.editMaterial} closeLabel={copy.close} width="wide" onClose={() => setDialog(undefined)}>
      <MaterialEditor
        storyId={storyId}
        material={material}
        session={session}
        copy={copy}
        disabled={disabled}
        onCancel={() => setDialog(undefined)}
        onSave={onEdit}
      />
    </MiniDialog>
    <MiniDialog open={dialog === "delete"} title={copy.deleteMaterial} closeLabel={copy.close} onClose={() => setDialog(undefined)}>
      <p className={styles.deleteConfirmation}>{copy.deleteMaterialConfirmation.replace("{{name}}", material.name)}</p>
      <div className={styles.confirmationActions}>
        <button type="button" className={styles.cancel} onClick={() => setDialog(undefined)}>{copy.cancel}</button>
        <button type="button" className={styles.delete} onClick={() => { setDialog(undefined); onDelete(); }}>{copy.deleteMaterial}</button>
      </div>
    </MiniDialog>
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
