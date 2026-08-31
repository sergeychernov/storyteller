import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./MaterialUploader.module.css";
import { useCapability } from "../../access-control.js";

interface MaterialUploaderProps {
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly uploading: boolean;
  readonly uploadCount: number;
  readonly onUpload: (files: readonly File[]) => void;
}

export function MaterialUploader({ copy, disabled, uploading, uploadCount, onUpload }: MaterialUploaderProps) {
  const canUpload = useCapability("media.upload");

  if (!canUpload) return null;

  const label = uploading ? copy.uploadingMaterials.replace("{{count}}", String(uploadCount)) : copy.addMaterial;
  return (
    <div
      className={classNames(
        styles.addCard,
        disabled && styles.disabled,
        uploading && styles.loading,
        uploading && sharedStyles.loading,
      )}
    >
      <span aria-hidden="true">＋</span>
      <strong aria-hidden="true">{label}</strong>
      <input
        className={styles.fileInput}
        type="file"
        aria-label={label}
        accept="image/*,video/*"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) onUpload(files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
