import type { AuthSession, FocusPoint, MaterialEdit, Scene, SceneMotion, Story } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";

export interface SceneChange {
  readonly durationSeconds?: number;
  readonly layoutId?: string | null;
  readonly motion?: SceneMotion;
  readonly focusPoint?: FocusPoint;
}

export interface StoryEditorViewProps {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selected: Scene | undefined;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly adding: boolean;
  readonly uploading: boolean;
  readonly uploadCount: number;
  readonly operationErrorMessage: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly onUpload: (files: readonly File[]) => void;
  readonly onDeleteMaterial: (materialId: string) => void;
  readonly onEditMaterial: (materialId: string, edit: MaterialEdit) => Promise<void>;
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onChange: (change: SceneChange) => void;
}
