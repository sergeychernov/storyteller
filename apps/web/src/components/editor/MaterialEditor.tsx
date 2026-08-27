import type { AuthSession, MaterialEdit, SceneMaterial } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialCropStage } from "./MaterialCropStage.js";
import { MaterialEditorToolbar } from "./MaterialEditorToolbar.js";
import { MiniDialog } from "./MiniDialog.js";
import styles from "./MaterialEditor.module.css";
import { cropPixelSize, rotatedDimensions } from "./material-editor-model.js";
import { useMaterialContentUrl } from "./use-material-content-url.js";
import { useMaterialEditor } from "./use-material-editor.js";
import { VideoMaterialEditor } from "./VideoMaterialEditor.js";

interface MaterialEditorProps {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly onClose: () => void;
  readonly onSave: (edit: MaterialEdit) => Promise<void>;
}

export function MaterialEditor({ storyId, material, session, copy, disabled, onClose, onSave }: MaterialEditorProps) {
  const { edit, setEdit, changed, submitting, failed, submit, cancel } = useMaterialEditor({ material, disabled, onSave, onClose });
  const { url, loading, failed: sourceFailed } = useMaterialContentUrl({ storyId, material, session, source: true });
  const dimensions = rotatedDimensions(material.width, material.height, edit.rotation);
  const canvasScale = Math.min(1, 960 / Math.max(dimensions.width, dimensions.height));
  const canvasWidth = Math.max(1, Math.round(dimensions.width * canvasScale));
  const canvasHeight = Math.max(1, Math.round(dimensions.height * canvasScale));
  const resultWidth = cropPixelSize(dimensions.width, edit.crop.x, edit.crop.width, material.kind === "video");
  const resultHeight = cropPixelSize(dimensions.height, edit.crop.y, edit.crop.height, material.kind === "video");
  return <MiniDialog
    open title={copy.editMaterial} closeLabel={copy.close} width="wide" variant="editor"
    closeDisabled={disabled || submitting} onClose={() => void submit()}
  ><div className={styles.editor}>
    <MaterialEditorToolbar edit={edit} dimensions={dimensions} copy={copy} disabled={disabled || submitting} onChange={setEdit} />

    {material.kind === "video" ? <VideoMaterialEditor
      storyId={storyId} session={session}
      material={material} url={url} loading={loading} sourceFailed={sourceFailed}
      edit={edit} width={canvasWidth} height={canvasHeight} copy={copy}
      disabled={disabled || submitting} onChange={setEdit}
    /> : <MaterialCropStage
      material={material}
      url={url}
      loading={loading}
      sourceFailed={sourceFailed}
      edit={edit}
      width={canvasWidth}
      height={canvasHeight}
      label={copy.cropArea}
      disabled={disabled || submitting}
      onCropChange={(crop) => setEdit((current) => ({ ...current, crop }))}
    />}

    <p className={styles.result}>{copy.cropResult.replace("{{width}}", String(resultWidth)).replace("{{height}}", String(resultHeight))}</p>
    {(failed || sourceFailed) && <p className={styles.error} role="alert">{copy.materialEditError}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.cancel} disabled={submitting} onClick={cancel}>{copy.cancel}</button>
      <button type="button" className={styles.apply} disabled={disabled || submitting || !changed || !url} onClick={() => void submit()}>
        {submitting ? copy.applyingChanges : copy.applyChanges}
      </button>
    </div>
  </div></MiniDialog>;
}
