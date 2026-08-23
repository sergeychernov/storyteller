import { useRef } from "react";
import type { EditorCopy } from "./editor-copy.js";

interface MaterialUploaderProps {
  readonly copy: EditorCopy;
  readonly disabled: boolean;
  readonly uploading: boolean;
  readonly uploadCount: number;
  readonly onUpload: (files: readonly File[]) => void;
}

export function MaterialUploader({ copy, disabled, uploading, uploadCount, onUpload }: MaterialUploaderProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" className={`secondary-button compact material-upload-button ${uploading ? "loading-button" : ""}`} disabled={disabled} onClick={() => input.current?.click()}>
        {uploading ? copy.uploadingMaterials.replace("{{count}}", String(uploadCount)) : `＋ ${copy.addMaterial}`}
      </button>
      <input
        ref={input}
        className="visually-hidden"
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
