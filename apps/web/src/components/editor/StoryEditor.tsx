import { useRef } from "react";
import type { AuthSession, Story } from "../../api.js";
import { DesktopStoryEditor } from "./DesktopStoryEditor.js";
import { MobileStoryEditor } from "./MobileStoryEditor.js";
import { useMediaQuery } from "./use-media-query.js";
import { useStoryEditor } from "./use-story-editor.js";
import { SceneDeleteDialog } from "./SceneDeleteDialog.js";
import sharedStyles from "./editor-shared.module.css";

interface StoryEditorProps {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function StoryEditor({ story, session, selectedId, onSelect }: StoryEditorProps) {
  const { view: editor, deletion } = useStoryEditor({ story, session, selectedId, onSelect });
  const editorRef = useRef<HTMLDivElement>(null);
  const panels = useMediaQuery("(min-width: 768px)");
  const compactPanels = useMediaQuery("(max-width: 1199px)");

  return <>
    <div ref={editorRef} tabIndex={-1} className={sharedStyles.focusRoot} inert={Boolean(deletion.target)}>
      {panels ? <DesktopStoryEditor {...editor} compact={compactPanels} /> : <MobileStoryEditor {...editor} />}
    </div>
    <SceneDeleteDialog deletion={deletion} copy={editor.copy} returnFocusRef={editorRef} />
  </>;
}
