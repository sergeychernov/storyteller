import { DomainError } from "./errors.js";
import {
  collageFrameShapes, collageFrameWidths, collageRowDirections, type CollageCardAngle, type CollageCardOffset,
  type CollageFrameWidth, type CollageSettings, type SceneMaterial,
} from "./model.js";

export const collageRendererId = "collage";
export const collageRendererMinimumMaterials = 2;
export const collageRendererMaximumMaterials = 6;
export const defaultCollageFrame = { width: 12 as const, color: "#FFFFFF", shape: "straight" as const };
export const defaultCollageRowDirection = "ascending" as const;
export const collageCardAngleMinimumDegrees = 2;
export const collageCardAngleDefaultMaximumDegrees = 8;
export const collageCardAngleAbsoluteMaximumDegrees = 10;
export const collageCardOffsetMinimumStep = 20;
export const collageCardOffsetMaximumStep = 40;
/** Matches the animated-collage skill's full-bleed source background treatment. */
export const collageBackgroundTreatment = {
  brightness: -0.4,
  saturation: 0.72,
} as const;
export const collageCardShadow = {
  offsetXRatio: 0,
  offsetYRatio: 0.014,
  blurSigmaRatio: 0.019,
  opacity: 0.4,
} as const;

/** Width used by layout and renderers; `none` never relies on a magic zero width. */
export function getCollageFrameWidth(frame: CollageSettings["frame"]): number {
  return frame.shape === "none" ? 0 : frame.width;
}

/** Migrates historical free-form widths to the nearest supported renderer preset. */
export function normalizeCollageFrameWidth(width: number): CollageFrameWidth {
  if (!Number.isFinite(width)) return defaultCollageFrame.width;
  return collageFrameWidths.reduce((closest, candidate) => (
    Math.abs(candidate - width) < Math.abs(closest - width) ? candidate : closest
  ));
}

export function getCollageCardShadowMetrics(outputWidth: number): {
  readonly offsetX: number; readonly offsetY: number; readonly blurSigma: number; readonly padding: number;
} {
  const offsetX = Math.round(outputWidth * collageCardShadow.offsetXRatio);
  const offsetY = Math.round(outputWidth * collageCardShadow.offsetYRatio);
  const blurSigma = Math.max(1, outputWidth * collageCardShadow.blurSigmaRatio);
  const padding = Math.ceil(Math.max(Math.abs(offsetX), Math.abs(offsetY)) + blurSigma * 3);
  return { offsetX, offsetY, blurSigma, padding };
}

export function isCollageMaterials(materials: readonly SceneMaterial[]): boolean {
  return materials.length >= collageRendererMinimumMaterials
    && materials.length <= collageRendererMaximumMaterials;
}

export function collageCardMaterials(
  materials: readonly SceneMaterial[], _legacySettings?: unknown,
): readonly SceneMaterial[] {
  return materials;
}

export function defaultCollageSettings(materials: readonly SceneMaterial[], durationSeconds = 5): CollageSettings {
  if (!isCollageMaterials(materials)) throw new DomainError("a collage requires 2 to 6 media cards");
  return {
    frame: defaultCollageFrame,
    entryDurationSeconds: Math.min(4, Math.max(0, durationSeconds - 1)),
    rowDirection: defaultCollageRowDirection,
    straightCards: false,
    cardAngles: [],
    cardOffsets: [],
  };
}

export function resolveCollageSettings(
  materials: readonly SceneMaterial[],
  settings?: Omit<CollageSettings, "frame" | "rowDirection" | "cardOffsets"> & {
    /** Accepted only while migrating the old settings-owned background model. */
    readonly background?: { readonly mode: "automatic" | "first-material" };
    readonly frame: Omit<CollageSettings["frame"], "width"> & { readonly width: number };
    readonly rowDirection?: CollageSettings["rowDirection"];
    readonly cardOffsets?: CollageSettings["cardOffsets"];
  },
  durationSeconds = 5,
): CollageSettings {
  const defaults = defaultCollageSettings(materials, durationSeconds);
  if (!settings) return defaults;
  const legacyWithoutFrame = settings.frame.width === 0;
  return {
    entryDurationSeconds: settings.entryDurationSeconds,
    rowDirection: settings.rowDirection ?? defaults.rowDirection,
    frame: {
      ...settings.frame,
      width: legacyWithoutFrame ? defaults.frame.width : normalizeCollageFrameWidth(settings.frame.width),
      color: settings.frame.color.toUpperCase(),
      shape: legacyWithoutFrame ? "none" : settings.frame.shape,
    },
    straightCards: settings.straightCards ?? false,
    cardAngles: settings.cardAngles ?? [],
    cardOffsets: settings.cardOffsets ?? [],
  };
}

export function hasCompleteCollageCardAngles(
  materials: readonly SceneMaterial[], settings: CollageSettings,
): boolean {
  const cards = collageCardMaterials(materials, settings);
  if (settings.cardAngles.length !== cards.length) return false;
  const materialIds = new Set(cards.map(({ id }) => id));
  if (new Set(settings.cardAngles.map(({ materialId }) => materialId)).size !== settings.cardAngles.length) return false;
  return settings.cardAngles.every(({ materialId, angleDegrees }) => materialIds.has(materialId)
    && Number.isFinite(angleDegrees)
    && Math.abs(angleDegrees) <= collageCardAngleAbsoluteMaximumDegrees
    && (settings.straightCards ? angleDegrees === 0 : Math.abs(angleDegrees) >= 0.05));
}

export function hasCompleteCollageCardOffsets(
  materials: readonly SceneMaterial[], settings: CollageSettings, rowSizes: readonly number[],
): boolean {
  const cards = collageCardMaterials(materials, settings);
  if (rowSizes.reduce((sum, size) => sum + size, 0) !== cards.length || settings.cardOffsets.length !== cards.length) return false;
  const materialIds = new Set(cards.map(({ id }) => id));
  if (new Set(settings.cardOffsets.map(({ materialId }) => materialId)).size !== settings.cardOffsets.length) return false;
  if (!settings.cardOffsets.every(({ materialId, offsetY }) => materialIds.has(materialId)
    && Number.isInteger(offsetY) && Math.abs(offsetY) <= collageCardOffsetMaximumStep * 2)) return false;
  const offsets = new Map(settings.cardOffsets.map(({ materialId, offsetY }) => [materialId, offsetY]));
  let materialIndex = 0;
  for (const rowSize of rowSizes) {
    const row = cards.slice(materialIndex, materialIndex + rowSize).map(({ id }) => offsets.get(id)!);
    materialIndex += rowSize;
    if (rowSize <= 1) {
      if (row[0] !== 0) return false;
      continue;
    }
    if (Math.abs(Math.min(...row) + Math.max(...row)) > 1) return false;
    for (let column = 1; column < row.length; column += 1) {
      const difference = row[column]! - row[column - 1]!;
      if (settings.rowDirection === "level") {
        if (difference !== 0) return false;
      } else if (Math.abs(difference) < collageCardOffsetMinimumStep
        || Math.abs(difference) > collageCardOffsetMaximumStep) return false;
      if (settings.rowDirection === "ascending" && difference >= 0) return false;
      if (settings.rowDirection === "descending" && difference <= 0) return false;
    }
  }
  return true;
}

export function getCollagePauseDurationSeconds(settings: CollageSettings, durationSeconds: number): number {
  return Math.max(0, durationSeconds - settings.entryDurationSeconds);
}

export function validateCollageSettings(
  materials: readonly SceneMaterial[], settings: CollageSettings, durationSeconds: number, rowSizes?: readonly number[],
): CollageSettings {
  const resolved = resolveCollageSettings(materials, settings, durationSeconds);
  const cards = collageCardMaterials(materials);
  if (!isCollageMaterials(cards)) throw new DomainError("collage background must leave 2 to 6 media cards");
  if (!(collageFrameWidths as readonly number[]).includes(resolved.frame.width)) {
    throw new DomainError("collage frame width must be one of 12, 16, 20 or 24 pixels");
  }
  if (!/^#[0-9a-f]{6}$/i.test(resolved.frame.color)) throw new DomainError("collage frame color must be a six-digit hex color");
  if (!(collageFrameShapes as readonly string[]).includes(resolved.frame.shape)) throw new DomainError("unknown collage frame shape");
  if (!(collageRowDirections as readonly string[]).includes(resolved.rowDirection)) throw new DomainError("unknown collage row direction");
  if (!Number.isFinite(resolved.entryDurationSeconds) || resolved.entryDurationSeconds <= 0
    || getCollagePauseDurationSeconds(resolved, durationSeconds) < 1) {
    throw new DomainError("collage appearance must be positive and leave at least 1 second of final hold");
  }
  if (rowSizes && !hasCompleteCollageCardAngles(materials, resolved)) {
    throw new DomainError("collage card angles must contain one valid final angle for every card");
  }
  if (!rowSizes && resolved.cardAngles.length && !hasCompleteCollageCardAngles(materials, resolved)) {
    throw new DomainError("collage card angles do not match the scene materials");
  }
  if (rowSizes && !hasCompleteCollageCardOffsets(materials, resolved, rowSizes)) {
    throw new DomainError("collage card offsets must contain one valid final offset for every card");
  }
  if (!rowSizes && resolved.cardOffsets.length) throw new DomainError("collage card offsets require a selected layout");
  return resolved;
}

export function collageCardAngleMap(angles: readonly CollageCardAngle[]): ReadonlyMap<string, number> {
  return new Map(angles.map(({ materialId, angleDegrees }) => [materialId, angleDegrees]));
}

export function collageCardOffsetMap(offsets: readonly CollageCardOffset[]): ReadonlyMap<string, number> {
  return new Map(offsets.map(({ materialId, offsetY }) => [materialId, offsetY]));
}
