import {
  collageCardMaterials, collageFrameWidths, collageLayoutDefinitions, createCollageCardAngles, createCollageCardOffsets,
  defaultCollageSettings, type CollageFrameShape,
  type CollageFrameWidth, type Scene,
} from "@storyteller/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SceneCanvas } from "./SceneCanvas.js";
import { SceneInspector } from "./SceneInspector.js";
import { getEditorCopy } from "./editor-copy.js";
import type { SceneChange } from "./story-editor-view.js";
import {
  createCollageStorybookScene, createUnsupportedCollageStorybookScene, storybookSession,
} from "../../storybook/editor-fixtures.js";
import styles from "./AnimatedCollage.stories.module.css";

interface AnimatedCollageArgs {
  readonly layoutId: string;
  readonly frameShape: CollageFrameShape;
  readonly frameWidth: CollageFrameWidth;
  readonly frameColor: string;
  readonly durationSeconds: number;
  readonly entryDurationSeconds: number;
  readonly rowDirection: "ascending" | "level" | "descending" | "random";
  readonly straightCards: boolean;
  readonly language: "en" | "ru" | "sr-Latn" | "es";
}

const layoutLabels = Object.fromEntries(collageLayoutDefinitions.map((layout) => [
  layout.id,
  `${layout.label} · ${layout.requirements.orientationSequence.toUpperCase()}`,
]));

const meta = {
  title: "Editor/Animated collage",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    layoutId: "portrait-pairs-descending",
    frameShape: "torn",
    frameWidth: 12,
    frameColor: "#FFFDF7",
    durationSeconds: 6,
    entryDurationSeconds: 2.5,
    rowDirection: "ascending",
    straightCards: false,
    language: "ru",
  },
  argTypes: {
    layoutId: {
      control: { type: "select", labels: layoutLabels },
      options: collageLayoutDefinitions.map(({ id }) => id),
    },
    frameShape: { control: "inline-radio", options: ["straight", "torn", "none"] },
    frameWidth: { control: "inline-radio", options: collageFrameWidths },
    frameColor: { control: "color" },
    durationSeconds: { control: { type: "range", min: 3, max: 15, step: 0.5 } },
    entryDurationSeconds: { control: { type: "range", min: 0.5, max: 10, step: 0.1 } },
    rowDirection: { control: "inline-radio", options: ["ascending", "level", "descending", "random"] },
    straightCards: { control: "boolean" },
    language: { control: "select", options: ["en", "ru", "sr-Latn", "es"] },
  },
  render: (args) => <CollagePlayground key={JSON.stringify(args)} {...args} />,
} satisfies Meta<AnimatedCollageArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const StraightFrame: Story = {
  args: {
    layoutId: "2+1+2",
    frameShape: "straight",
    frameColor: "#F5E6C8",
    frameWidth: 12,
  },
};

export const WithoutFrame: Story = {
  args: { frameShape: "none" },
};

export const CropAwareOrientations: Story = {
  args: { layoutId: "2x2" },
  render: (args) => <CollagePlayground key={JSON.stringify(args)} {...args} cropAware />,
};

export const CustomMaterialBackground: Story = {
  parameters: { controls: { disable: true } },
  render: () => <CollageScenePlayground scene={createCollageStorybookScene("stack", { customBackground: true })} />,
};

export const EveryImplementedLayout: Story = {
  parameters: { controls: { disable: true } },
  render: () => <div className={styles.gallery}>
    {collageLayoutDefinitions.map((layout) => {
      const scene = createCollageStorybookScene(layout.id, { frameShape: "torn" });
      return <figure key={layout.id}>
        <div className={styles.galleryPreview}>
          <SceneCanvas scene={scene} copy={getEditorCopy("ru")} storyId="storybook" session={storybookSession} presentation="desktop" />
        </div>
        <figcaption>
          <strong>{layout.label}</strong>
          <code>{layout.requirements.orientationSequence} · перекрытие {Math.round(layout.overlapRatio * 100)}%</code>
        </figcaption>
      </figure>;
    })}
  </div>,
};

export const UnsupportedSequence: Story = {
  parameters: { controls: { disable: true } },
  render: () => <div className={styles.playground}>
    <div className={styles.preview}>
      <SceneCanvas
        scene={createUnsupportedCollageStorybookScene()}
        copy={getEditorCopy("ru")}
        storyId="storybook"
        session={storybookSession}
        presentation="desktop"
      />
    </div>
  </div>,
};

function CollagePlayground(props: AnimatedCollageArgs & { readonly cropAware?: boolean }) {
  const initialScene = createCollageStorybookScene(props.layoutId, {
    frameShape: props.frameShape,
    frameWidth: props.frameWidth,
    frameColor: props.frameColor,
    durationSeconds: props.durationSeconds,
    entryDurationSeconds: props.entryDurationSeconds,
    rowDirection: props.rowDirection,
    straightCards: props.straightCards,
    ...(props.cropAware === undefined ? {} : { cropAware: props.cropAware }),
  });
  return <CollageScenePlayground scene={initialScene} language={props.language} />;
}

function CollageScenePlayground({ scene: initialScene, language = "ru" }: {
  readonly scene: Scene; readonly language?: AnimatedCollageArgs["language"];
}) {
  const [scene, setScene] = useState(initialScene);
  const copy = getEditorCopy(language);
  const changeScene = (change: SceneChange) => setScene((current) => applySceneChange(current, change));
  return <main className={styles.playground}>
    <div className={styles.preview}>
      <SceneCanvas
        scene={scene}
        copy={copy}
        storyId="storybook"
        session={storybookSession}
        presentation="desktop"
        onChange={changeScene}
      />
    </div>
    <aside className={styles.inspector}>
      <SceneInspector
        scene={scene}
        copy={copy}
        saving={false}
        storyId="storybook"
        session={storybookSession}
        variant="desktop"
        onChange={changeScene}
      />
    </aside>
  </main>;
}

function applySceneChange(scene: Scene, change: SceneChange): Scene {
  const selectedLayoutId = typeof change.layoutId === "string" ? change.layoutId : scene.layoutId;
  const straightCards = change.collage?.straightCards ?? scene.collage?.straightCards ?? false;
  const recalculateAngles = change.collage?.straightCards !== undefined || typeof change.layoutId === "string";
  const rowDirection = change.collage?.rowDirection ?? scene.collage?.rowDirection
    ?? defaultCollageSettings(scene.materials, scene.durationSeconds).rowDirection;
  const recalculateOffsets = change.collage?.rowDirection !== undefined || typeof change.layoutId === "string";
  const collage = change.collage === undefined ? scene.collage : {
    ...(scene.collage ?? defaultCollageSettings(scene.materials, scene.durationSeconds)),
    ...change.collage,
    rowDirection,
    straightCards,
    cardAngles: recalculateAngles && selectedLayoutId ? createCollageCardAngles({
      layoutId: selectedLayoutId,
      materials: collageCardMaterials(scene.materials),
      straightCards,
      seedKey: `storybook-change:${selectedLayoutId}:${straightCards}`,
    }) : scene.collage?.cardAngles ?? [],
    cardOffsets: recalculateOffsets && selectedLayoutId ? createCollageCardOffsets({
      layoutId: selectedLayoutId,
      materials: collageCardMaterials(scene.materials),
      direction: rowDirection,
      seedKey: `storybook-change:${selectedLayoutId}:${rowDirection}:${scene.collage?.cardOffsets.map(({ offsetY }) => offsetY).join(",")}`,
    }) : scene.collage?.cardOffsets ?? [],
  };
  const next: Scene = {
    ...scene,
    ...(change.durationSeconds === undefined ? {} : { durationSeconds: change.durationSeconds }),
    ...(typeof change.layoutId === "string" ? { layoutId: change.layoutId } : {}),
    ...(change.motion === undefined ? {} : { motion: change.motion }),
    ...(change.focusPoint === undefined ? {} : { focusPoint: change.focusPoint }),
    ...(collage === undefined ? {} : { collage }),
  };
  if (change.layoutId !== null) return next;
  const { layoutId: _layoutId, ...withoutLayout } = next;
  return withoutLayout;
}
