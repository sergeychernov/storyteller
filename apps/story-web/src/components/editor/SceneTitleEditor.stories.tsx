import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Scene, SceneTitle } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { SceneTitleOverlay } from "./SceneTitleOverlay.js";
import { SceneTitlePanel } from "./SceneTitlePanel.js";
import type { SceneTitleEditorController } from "./use-scene-title-editor.js";
import styles from "./SceneTitleEditor.stories.module.css";

interface TitleEditorStoryArgs { readonly variant: "desktop" | "mobile" }

const meta = {
  title: "Editor/Scene title/Editor",
  component: TitleEditorStory,
  parameters: { layout: "fullscreen" },
  args: { variant: "desktop" },
  argTypes: { variant: { control: "inline-radio", options: ["desktop", "mobile"] } },
} satisfies Meta<typeof TitleEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
export const Mobile: Story = { args: { variant: "mobile" } };

function TitleEditorStory({ variant }: TitleEditorStoryArgs) {
  const [title, setTitle] = useState<SceneTitle | undefined>({
    text: "Первый снег\nнад Белградом",
    position: { x: 0.5, y: 0.78 },
    style: "shadow",
    size: "medium",
    color: "#FFFFFF",
    timing: { startSeconds: 0, endSeconds: 5 },
  });
  const scene: Scene = {
    id: "title-story", rendererId: "still-image", materials: [{
      id: "image", kind: "image", name: "image.jpg", orientation: "portrait", storageKey: "image.jpg",
      mimeType: "image/jpeg", sizeBytes: 100, width: 1080, height: 1920,
    }], durationSeconds: 5, motion: "none", render: { status: "idle" }, ...(title ? { title } : {}),
  };
  const editor: SceneTitleEditorController = {
    title, canAdd: true, saving: false,
    add: () => setTitle({
      text: "", position: { x: 0.5, y: 0.78 }, style: "shadow", size: "medium", color: "#FFFFFF",
      timing: { startSeconds: 0, endSeconds: 5 },
    }),
    remove: async () => setTitle(undefined),
    preview: setTitle,
    save: async (next) => setTitle(next),
    saveText: async () => undefined,
  };
  return <div className={variant === "mobile" ? styles.mobileShell : styles.desktopShell}>
    <div className={styles.frame}>
      <div className={styles.photo}><span>WINTER · 2026</span></div>
      {title && <SceneTitleOverlay title={title} localTimeSeconds={2} editing moveLabel="Move title"
        onCommitPosition={(position) => setTitle({ ...title, position })} />}
    </div>
    <div className={styles.panel}>
      <SceneTitlePanel scene={scene} copy={getEditorCopy("ru")} editor={editor} variant={variant} />
    </div>
  </div>;
}
