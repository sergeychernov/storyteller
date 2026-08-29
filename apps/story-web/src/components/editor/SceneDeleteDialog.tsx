import { useRef, type RefObject } from "react";
import type { EditorCopy } from "./editor-copy.js";
import { MiniDialog } from "./MiniDialog.js";
import type { SceneDeletionController } from "./use-delete-scene.js";
import styles from "./SceneDeleteDialog.module.css";

export function SceneDeleteDialog({ deletion, copy, returnFocusRef }: {
  readonly deletion: SceneDeletionController;
  readonly copy: EditorCopy;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const status = deletion.result?.status;
  const checkOnly = status === "unverified" || deletion.failed;
  const error = status === "changed" ? copy.sceneDeleteChanged : status === "blocked" ? copy.sceneDeleteBlocked
    : checkOnly ? copy.sceneDeleteUnverified : status === "failed" ? copy.sceneDeleteError : undefined;
  return <MiniDialog open={Boolean(deletion.target)} title={copy.deleteSceneTitle.replace("{{name}}", deletion.target?.name ?? "")}
    closeLabel={copy.close} closeDisabled={deletion.pending} onClose={deletion.close}
    initialFocusRef={cancelRef} returnFocusRef={returnFocusRef}>
    <div className={styles.content} aria-busy={deletion.pending}>
      <p>{copy.deleteSceneConfirmation}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={styles.cancel} disabled={deletion.pending} onClick={deletion.close}>{copy.cancel}</button>
        <button type="button" className={styles.delete} disabled={deletion.pending || status === "changed" || status === "blocked"}
          onClick={deletion.confirm}>
          {deletion.pending ? copy.deletingScene : checkOnly ? copy.checkSceneDeletion : copy.confirmDeleteScene}
        </button>
      </div>
    </div>
  </MiniDialog>;
}
