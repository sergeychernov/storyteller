import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  collageFrameWidths, getCollageFrameWidth, type CollageFrameShape, type CollageFrameWidth,
} from "@storyteller/domain";
import { CollageCard } from "./CollageCard.js";
import { MaterialThumbnail } from "./MaterialThumbnail.js";
import {
  createStorybookImageMaterial, storybookSession,
} from "../../storybook/editor-fixtures.js";
import styles from "./CollageCard.stories.module.css";

interface CollageCardStoryArgs {
  readonly orientation: "portrait" | "landscape";
  readonly frameShape: CollageFrameShape;
  readonly frameWidth: CollageFrameWidth;
  readonly frameColor: string;
  readonly rotationDegrees: number;
  readonly scalePercent: number;
  readonly cropAware: boolean;
}

const meta = {
  title: "Editor/Animated collage/Card",
  component: CollageCardStory,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    orientation: "portrait",
    frameShape: "torn",
    frameWidth: 12,
    frameColor: "#FFFDF7",
    rotationDegrees: -5,
    scalePercent: 72,
    cropAware: false,
  },
  argTypes: {
    orientation: { control: "inline-radio", options: ["portrait", "landscape"] },
    frameShape: { control: "inline-radio", options: ["straight", "torn", "none"] },
    frameWidth: { control: "inline-radio", options: collageFrameWidths },
    frameColor: { control: "color" },
    rotationDegrees: { control: { type: "range", min: -45, max: 45, step: 1 } },
    scalePercent: { control: { type: "range", min: 30, max: 100, step: 1 } },
    cropAware: { control: "boolean" },
  },
} satisfies Meta<typeof CollageCardStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const StraightLandscape: Story = {
  args: {
    orientation: "landscape",
    frameShape: "straight",
    frameColor: "#F4E4C4",
    frameWidth: 16,
    rotationDegrees: 7,
    scalePercent: 78,
  },
};

export const CropAwarePortrait: Story = {
  args: { cropAware: true, rotationDegrees: 0 },
};

export const WithoutFrame: Story = {
  args: { frameShape: "none", rotationDegrees: 12 },
};

function CollageCardStory(args: CollageCardStoryArgs) {
  const material = createStorybookImageMaterial(args.orientation, 1, args.cropAware);
  const portrait = args.orientation === "portrait";
  const contentWidth = portrait ? 720 : 1280;
  const contentHeight = portrait ? 1280 : 720;
  const frame = { shape: args.frameShape, width: args.frameWidth, color: args.frameColor };
  const renderWidth = contentWidth + getCollageFrameWidth(frame) * 2;
  return <div className={styles.stage}>
    <CollageCard
      cardIndex={0}
      width={`${renderWidth / 10.8}%`}
      contentWidth={contentWidth}
      contentHeight={contentHeight}
      frame={frame}
      className={styles.card!}
      style={{
        transform: `translate(-50%, -50%) rotate(${args.rotationDegrees}deg) scale(${args.scalePercent / 100})`,
      }}
    ><MaterialThumbnail
        storyId="storybook"
        material={material}
        session={storybookSession}
        presentation="preview"
      /></CollageCard>
  </div>;
}
