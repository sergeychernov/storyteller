import {
  createCollageCardAngles, createCollageCardOffsets, defaultCollageSettings, getCollageLayoutDefinition,
  type CollageFrameWidth, type CollageSettings, type ImageMaterial, type Scene,
} from "@storyteller/domain";
import type { AuthSession } from "../api.js";

export const storybookSession: AuthSession = {
  accessToken: "storybook",
  expiresAt: "2099-01-01T00:00:00.000Z",
  profile: {
    id: "storybook",
    name: "Storybook",
    email: "storybook@example.invalid",
    language: "ru",
  },
};

interface CollageSceneOptions {
  readonly customBackground?: boolean;
  readonly frameShape?: CollageSettings["frame"]["shape"];
  readonly frameWidth?: CollageFrameWidth;
  readonly frameColor?: string;
  readonly durationSeconds?: number;
  readonly entryDurationSeconds?: number;
  readonly rowDirection?: CollageSettings["rowDirection"];
  readonly cropAware?: boolean;
  readonly straightCards?: boolean;
}

export function createCollageStorybookScene(layoutId: string, options: CollageSceneOptions = {}): Scene {
  const layout = getCollageLayoutDefinition(layoutId);
  if (!layout) throw new Error(`Unknown Storybook collage layout: ${layoutId}`);
  const cards = createOrientationMaterials(layout.requirements.orientationSequence, options.cropAware ?? false);
  const materials = cards;
  const durationSeconds = options.durationSeconds ?? 6;
  const defaults = defaultCollageSettings(materials, durationSeconds);
  const straightCards = options.straightCards ?? false;
  const rowDirection = options.rowDirection ?? defaults.rowDirection;
  return {
    id: `storybook-${layoutId}`,
    rendererId: "collage",
    collageBackground: options.customBackground
      ? { source: "material", material: createStorybookImageMaterial("landscape", 99) }
      : { source: "previous-scene" },
    layoutId,
    materials,
    durationSeconds,
    motion: "none",
    collage: {
      frame: {
        shape: options.frameShape ?? "torn",
        width: options.frameWidth ?? 12,
        color: options.frameColor ?? "#FFFDF7",
      },
      entryDurationSeconds: options.entryDurationSeconds ?? defaults.entryDurationSeconds,
      rowDirection,
      straightCards,
      cardAngles: createCollageCardAngles({
        layoutId,
        materials: cards,
        straightCards,
        seedKey: `storybook:${layoutId}`,
      }),
      cardOffsets: createCollageCardOffsets({
        layoutId,
        materials: cards,
        direction: rowDirection,
        seedKey: `storybook:${layoutId}`,
      }),
    },
    render: { status: "idle" },
  };
}

export function createUnsupportedCollageStorybookScene(): Scene {
  return {
    id: "storybook-unsupported",
    rendererId: "collage",
    materials: createOrientationMaterials("lpl"),
    durationSeconds: 6,
    motion: "none",
    render: { status: "idle" },
  };
}

function createOrientationMaterials(sequence: string, cropAware = false): ImageMaterial[] {
  let portraitIndex = 0;
  let landscapeIndex = 0;
  return [...sequence].map((orientation) => {
    if (orientation === "p") {
      portraitIndex += 1;
      return createStorybookImageMaterial("portrait", portraitIndex, cropAware);
    }
    landscapeIndex += 1;
    return createStorybookImageMaterial("landscape", landscapeIndex);
  });
}

export function createStorybookImageMaterial(
  presentation: "portrait" | "landscape", index = 1, cropAware = false,
): ImageMaterial {
  const id = `${presentation}-${index}`;
  const presentedWidth = presentation === "portrait" ? 900 : 1600;
  const presentedHeight = presentation === "portrait" ? 1600 : 900;
  const sourceWidth = cropAware ? 2400 : presentedWidth;
  const sourceHeight = cropAware ? 1600 : presentedHeight;
  return {
    id,
    kind: "image",
    name: `${id}.svg`,
    orientation: sourceWidth < sourceHeight ? "portrait" : "landscape",
    storageKey: `storybook/${id}.svg`,
    mimeType: "image/svg+xml",
    sizeBytes: 1,
    width: sourceWidth,
    height: sourceHeight,
    ...(cropAware ? {
      edit: {
        rotation: 0 as const,
        crop: { x: 0.31, y: 0, width: 0.38, height: 1 },
        result: {
          storageKey: `storybook/${id}-crop.svg`,
          mimeType: "image/svg+xml",
          sizeBytes: 1,
          width: presentedWidth,
          height: presentedHeight,
          orientation: presentation,
        },
      },
    } : {}),
  };
}
