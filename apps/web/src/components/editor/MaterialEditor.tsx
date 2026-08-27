import { useMemo, useState } from "react";
import type { AuthSession, MaterialEdit, SceneMaterial } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { MaterialCropStage } from "./MaterialCropStage.js";
import styles from "./MaterialEditor.module.css";
import {
  cropForAspect, cropPixelSize, fullCrop, identityEdit, rotateEdit, rotatedDimensions, sameEdit,
} from "./material-editor-model.js";
import { useMaterialContentUrl } from "./use-material-content-url.js";

interface MaterialEditorProps {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSave: (edit: MaterialEdit) => Promise<void>;
}

export function MaterialEditor({ storyId, material, session, copy, disabled, onCancel, onSave }: MaterialEditorProps) {
  const initial = useMemo<MaterialEdit>(() => material.edit
    ? { rotation: material.edit.rotation, crop: material.edit.crop }
    : identityEdit, [material.edit]);
  const [edit, setEdit] = useState<MaterialEdit>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const { url, loading, failed: sourceFailed } = useMaterialContentUrl({ storyId, material, session, source: true });
  const dimensions = rotatedDimensions(material.width, material.height, edit.rotation);
  const canvasScale = Math.min(1, 960 / Math.max(dimensions.width, dimensions.height));
  const canvasWidth = Math.max(1, Math.round(dimensions.width * canvasScale));
  const canvasHeight = Math.max(1, Math.round(dimensions.height * canvasScale));
  const resultWidth = cropPixelSize(dimensions.width, edit.crop.x, edit.crop.width);
  const resultHeight = cropPixelSize(dimensions.height, edit.crop.y, edit.crop.height);
  const changed = !sameEdit(edit, initial);

  async function submit() {
    setSubmitting(true);
    setFailed(false);
    try {
      await onSave(edit);
      onCancel();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return <div className={styles.editor}>
    <div className={styles.toolbar}>
      <div className={styles.toolGroup} aria-label={copy.rotateMaterial}>
        <button type="button" disabled={disabled || submitting} aria-label={copy.rotateLeft} title={copy.rotateLeft} onClick={() => setEdit(rotateEdit(edit, false))}>↶</button>
        <button type="button" disabled={disabled || submitting} aria-label={copy.rotateRight} title={copy.rotateRight} onClick={() => setEdit(rotateEdit(edit, true))}>↷</button>
      </div>
      <button type="button" className={styles.reset} disabled={disabled || submitting || sameEdit(edit, identityEdit)} onClick={() => setEdit(identityEdit)}>{copy.resetEditing}</button>
    </div>

    <MaterialCropStage
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
    />

    <div className={styles.presets} aria-label={copy.cropMaterial}>
      <button type="button" disabled={disabled || submitting} onClick={() => setEdit((current) => ({ ...current, crop: fullCrop }))}>{copy.originalFrame}</button>
      <button type="button" disabled={disabled || submitting} onClick={() => setEdit((current) => ({ ...current, crop: cropForAspect(dimensions, 1) }))}>{copy.squareFrame}</button>
      <button type="button" disabled={disabled || submitting} onClick={() => setEdit((current) => ({ ...current, crop: cropForAspect(dimensions, 9 / 16) }))}>{copy.verticalFrame}</button>
      <button type="button" disabled={disabled || submitting} onClick={() => setEdit((current) => ({ ...current, crop: cropForAspect(dimensions, 16 / 9) }))}>{copy.horizontalFrame}</button>
    </div>
    <p className={styles.result}>{copy.cropResult.replace("{{width}}", String(resultWidth)).replace("{{height}}", String(resultHeight))}</p>
    {(failed || sourceFailed) && <p className={styles.error} role="alert">{copy.materialEditError}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.cancel} disabled={submitting} onClick={onCancel}>{copy.cancel}</button>
      <button type="button" className={styles.apply} disabled={disabled || submitting || !changed || !url} onClick={() => void submit()}>
        {submitting ? copy.applyingChanges : copy.applyChanges}
      </button>
    </div>
  </div>;
}
