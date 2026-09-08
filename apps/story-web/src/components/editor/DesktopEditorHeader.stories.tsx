import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Scene } from "../../api.js";
import { DesktopEditorHeader } from "./DesktopEditorHeader.js";
import { getEditorCopy } from "./editor-copy.js";

const scene: Scene = {
  id: "scene-1", materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" },
  title: { text: "Запретный городишко", position: { x: 0.5, y: 0.78 }, style: "shadow", size: "medium",
    color: "#FFFFFF", timing: { startSeconds: 0, endSeconds: 5 } },
};

const meta = {
  title: "Editor/Story header",
  component: DesktopEditorHeader,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div style={{ background: "#12120f" }}><Story /></div>],
  args: {
    storyId: "story-1", storyTitle: "Пекин, запретный город",
    scenes: [scene, scene, scene, scene, scene], selected: scene,
    copy: getEditorCopy("ru"), saving: false, compact: false,
  },
} satisfies Meta<typeof DesktopEditorHeader>;

export default meta;
type StoryType = StoryObj<typeof meta>;

export const Wide: StoryType = {};

/** Between 768 and 1199 pixels only the glyphs remain; the labels stay for a screen reader. */
export const Compact: StoryType = { args: { compact: true } };

export const CompactWhileSaving: StoryType = { args: { compact: true, saving: true } };
