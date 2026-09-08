import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { SoundtrackPresetId, SoundtrackPresetSummary } from "../../api.js";
import { SoundtrackStylePicker, type SoundtrackStylePickerProps } from "./SoundtrackStylePicker.js";

const presets: readonly SoundtrackPresetSummary[] = [
  { id: "road", version: 1, bpm: 96, default: true },
  { id: "lounge", version: 1, bpm: 84, default: false },
  { id: "dnb", version: 1, bpm: 174, default: false },
];

const names: Record<SoundtrackPresetId, string> = { road: "Дорога", lounge: "Лаундж", dnb: "Драм-н-бэйс" };
const english: Record<SoundtrackPresetId, string> = { road: "Road", lounge: "Lounge", dnb: "Drum & bass" };

/** Selection is local so the tiles react in the canvas the way they do in the panel. */
function StylePickerPlayground({ value: initial, ...args }: SoundtrackStylePickerProps) {
  const [value, setValue] = useState(initial);
  // The picker is built for the dark preview page, so the stories carry that ground with them.
  return <div style={{ width: 380, maxWidth: "100vw", padding: 20, borderRadius: 14, background: "#171714" }}>
    <SoundtrackStylePicker {...args} value={value} onChange={setValue} />
  </div>;
}

const meta = {
  title: "Preview/Soundtrack style picker",
  component: StylePickerPlayground,
  parameters: { layout: "centered" },
  args: { presets, value: "road", names, legend: "Стиль", disabled: false, onChange: () => undefined },
  argTypes: { presets: { control: false }, onChange: { control: false }, value: { control: false } },
} satisfies Meta<typeof StylePickerPlayground>;

export default meta;
type StoryType = StoryObj<typeof meta>;

export const Default: StoryType = {};

export const LoungeSelected: StoryType = {
  args: { value: "lounge" },
};

/** Names never take space in the tile, so a longer language changes nothing about the layout. */
export const EnglishNames: StoryType = {
  args: { names: english, legend: "Style" },
};

/** While a soundtrack is rendering the choice is locked. */
export const Disabled: StoryType = {
  args: { value: "dnb", disabled: true },
};
