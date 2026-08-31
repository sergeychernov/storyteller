import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryCard } from "./StoryCard.js";

const meta = {
  title: "Library/Story card",
  component: StoryCard,
  tags: ["autodocs"],
  args: {
    story: {
      id: "storybook-story",
      profileId: "storybook",
      title: "Weekend in Karelia",
      status: "draft",
      sceneCount: 7,
      revision: 1,
    },
  },
  decorators: [(Story) => <div style={{ width: 420, maxWidth: "calc(100vw - 32px)" }}><Story /></div>],
} satisfies Meta<typeof StoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {};

export const Published: Story = {
  args: {
    story: {
      id: "storybook-published-story",
      profileId: "storybook",
      title: "The lake at sunrise",
      status: "published",
      sceneCount: 12,
      revision: 8,
    },
  },
};
