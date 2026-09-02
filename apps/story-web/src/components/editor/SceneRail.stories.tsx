import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Scene, StoryTimeline, VideoMaterial } from "../../api.js";
import { createStorybookImageMaterial } from "../../storybook/editor-fixtures.js";
import { getEditorCopy } from "./editor-copy.js";
import { SceneRail } from "./SceneRail.js";

function TimelineRailPlayground({ scenes: suppliedScenes, ...args }: Parameters<typeof SceneRail>[0]) {
  const [scenes, setScenes] = useState(suppliedScenes);
  return <div style={{ width: args.variant === "mobileTimeline" ? "100%" : 240, maxWidth: "100vw", height: "100vh" }}>
    <SceneRail
      {...args}
      scenes={scenes}
      onReorder={(ids) => setScenes(ids.map((id) => scenes.find((scene) => scene.id === id)!))}
    />
  </div>;
}

const video: VideoMaterial = {
  id: "video", kind: "video", name: "clip.mp4", orientation: "portrait", storageKey: "storybook/clip.mp4",
  mimeType: "video/mp4", sizeBytes: 1, width: 1080, height: 1920, hasAudio: false, audioTags: [], sourceDurationSeconds: 190,
};

const initialScenes: readonly Scene[] = [{
  id: "empty", title: "Переход", materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" },
}, {
  id: "photo", title: "Озеро", materials: [createStorybookImageMaterial("portrait")],
  durationSeconds: 5, motion: "zoom-in", rendererId: "still-image", render: { status: "idle" },
}, {
  id: "video", title: "Дорога", materials: [video], durationSeconds: 5, motion: "none", render: { status: "idle" },
}];

const timeline: StoryTimeline = {
  storyId: "storybook", revision: 7, sceneOrder: initialScenes.map(({ id }) => id),
  scenes: [
    { sceneId: "empty", index: 0, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, startFrame: 0, endFrame: 0, durationFrames: 0, durationSource: "empty" },
    { sceneId: "photo", index: 1, materialIds: ["portrait-1"], startSeconds: 0, endSeconds: 5, durationSeconds: 5, startFrame: 0, endFrame: 150, durationFrames: 150, durationSource: "scene" },
    { sceneId: "video", index: 2, materialIds: ["video"], startSeconds: 5, endSeconds: 195, durationSeconds: 190, startFrame: 150, endFrame: 5850, durationFrames: 5700, durationSource: "video" },
  ],
  frameRate: { numerator: 30, denominator: 1 }, totalFrames: 5850, totalDurationSeconds: 195, transitionOverlapSeconds: 0,
  warnings: [{ code: "empty_scene", sceneId: "empty" }],
  formatLimits: [
    { formatId: "youtube-shorts", maxDurationSeconds: 180, requiresVerifiedAccount: false, status: "exceeded", excessSeconds: 15 },
    { formatId: "youtube-video", maxDurationSeconds: 900, requiresVerifiedAccount: false, status: "within_limit", excessSeconds: 0 },
    { formatId: "youtube-video-verified", maxDurationSeconds: 43_200, requiresVerifiedAccount: true, status: "within_limit", excessSeconds: 0 },
  ],
};

const meta = {
  title: "Editor/Scene timeline",
  component: SceneRail,
  parameters: { layout: "fullscreen" },
  args: {
    scenes: initialScenes,
    selectedId: "photo",
    copy: getEditorCopy("ru"),
    adding: false,
    saving: false,
    onSelect: () => undefined,
    onAdd: () => undefined,
    onRetryTimeline: () => undefined,
    timeline,
    timelineLoading: false,
    timelineError: false,
    variant: "desktop",
  },
  render: (args) => <TimelineRailPlayground {...args} />,
} satisfies Meta<typeof SceneRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const MobileTimeline: Story = {
  args: { variant: "mobileTimeline" },
};

export const Loading: Story = {
  args: { timeline: undefined, timelineLoading: true },
};

export const RecoverableError: Story = {
  args: { timeline: undefined, timelineError: true },
};
