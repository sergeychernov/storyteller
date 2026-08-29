import { useRef } from "react";
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
  const input = useRef<HTMLInputElement>(null);
  const canUpload = useCapability("media.upload");

  if (!canUpload) return null;

  return (
    <>
      <button type="button" className={classNames(styles.addCard, uploading && styles.loading, uploading && sharedStyles.loading)} disabled={disabled} onClick={() => input.current?.click()}>
        <span aria-hidden="true">＋</span>
        <strong>{uploading ? copy.uploadingMaterials.replace("{{count}}", String(uploadCount)) : copy.addMaterial}</strong>
      </button>
      <input
        ref={input}
        className={styles.visuallyHidden}
        type="file"
        aria-hidden="true"
        tabIndex={-1}
        accept="image/*,video/*"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) onUpload(files);
          event.target.value = "";
        }}
      />
    </>
  );
}
