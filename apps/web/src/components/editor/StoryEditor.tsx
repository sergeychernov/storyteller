import type { AuthSession, Story } from "../../api.js";
import { DesktopStoryEditor } from "./DesktopStoryEditor.js";
import { MobileStoryEditor } from "./MobileStoryEditor.js";
import { useMediaQuery } from "./use-media-query.js";
import { useStoryEditor } from "./use-story-editor.js";

interface StoryEditorProps {
  readonly story: Story;
  readonly session: AuthSession;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function StoryEditor({ story, session, selectedId, onSelect }: StoryEditorProps) {
  const editor = useStoryEditor({ story, session, selectedId, onSelect });
  const panels = useMediaQuery("(min-width: 768px)");
  const compactPanels = useMediaQuery("(max-width: 1199px)");

  return panels ? <DesktopStoryEditor {...editor} compact={compactPanels} /> : <MobileStoryEditor {...editor} />;
}
