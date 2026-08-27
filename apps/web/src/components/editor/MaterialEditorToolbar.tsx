import type { MaterialEdit } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import { cropForAspect, fullCrop, identityEdit, rotateEdit, sameEdit } from "./material-editor-model.js";
import styles from "./MaterialEditorToolbar.module.css";

interface MaterialEditorToolbarProps {
  readonly edit: MaterialEdit;
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly onChange: (edit: MaterialEdit) => void;
}

export function MaterialEditorToolbar({ edit, dimensions, copy, disabled, onChange }: MaterialEditorToolbarProps) {
  const presets = [
    { label: copy.originalFrame, ratio: undefined, aspect: undefined },
    { label: copy.squareFrame, ratio: "1:1", aspect: 1 },
    { label: copy.verticalFrame, ratio: "9:16", aspect: 9 / 16 },
    { label: copy.horizontalFrame, ratio: "16:9", aspect: 16 / 9 },
  ];

  return <div className={styles.toolbar}>
    <div className={styles.group} role="group" aria-label={copy.rotateMaterial}>
      <button type="button" className={styles.iconButton} disabled={disabled} aria-label={copy.rotateLeft} title={copy.rotateLeft}
        onClick={() => onChange(rotateEdit(edit, false))}>↶</button>
      <button type="button" className={styles.iconButton} disabled={disabled} aria-label={copy.rotateRight} title={copy.rotateRight}
        onClick={() => onChange(rotateEdit(edit, true))}>↷</button>
    </div>
    <div className={`${styles.group} ${styles.presets}`} role="group" aria-label={copy.cropMaterial}>
      {presets.map(({ label, ratio, aspect }) => <button
        key={label} type="button" disabled={disabled} aria-label={label} title={label}
        onClick={() => onChange({ ...edit, crop: aspect === undefined ? fullCrop : cropForAspect(dimensions, aspect) })}
      >
        {ratio ?? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" /></svg>}
      </button>)}
    </div>
    <button type="button" className={`${styles.iconButton} ${styles.reset}`} disabled={disabled || sameEdit(edit, identityEdit)}
      aria-label={copy.resetEditing} title={copy.resetEditing} onClick={() => onChange(identityEdit)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.7 8.4M3 4v6h6" /></svg>
    </button>
  </div>;
}
