import { useMemo, useRef, useState } from "react";
import type { MaterialEdit, SceneMaterial } from "../../api.js";
import { identityEdit, sameEdit } from "./material-editor-model.js";

interface MaterialEditorOptions {
  readonly material: SceneMaterial;
  readonly disabled: boolean;
  readonly onSave: (edit: MaterialEdit) => Promise<void>;
  readonly onClose: () => void;
}

export function useMaterialEditor({ material, disabled, onSave, onClose }: MaterialEditorOptions) {
  const initial = useMemo<MaterialEdit>(() => material.edit
    ? { rotation: material.edit.rotation, crop: material.edit.crop, ...(material.edit.trim ? { trim: material.edit.trim } : {}) }
    : identityEdit, [material.edit]);
  const [edit, setEdit] = useState<MaterialEdit>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const changed = !sameEdit(edit, initial);

  async function submit() {
    if (disabled || saving.current) return;
    if (!changed) { onClose(); return; }
    saving.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      await onSave(edit);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  function cancel() {
    if (!saving.current) onClose();
  }

  return { edit, setEdit, changed, submitting, failed, submit, cancel };
}
