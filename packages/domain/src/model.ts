export const storyStatuses = ["draft", "rendering", "ready", "publishing", "published"] as const;

export type StoryStatus = (typeof storyStatuses)[number];
export type AssetKind = "image" | "video" | "audio";
export type JobStatus = "idle" | "queued" | "running" | "ready" | "failed";
export type MaterialOrientation = "portrait" | "landscape";
export type VideoAudioTag = "voice" | "music" | "ambient";
export type SceneMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type MaterialRotation = 0 | 90 | 180 | 270;
export const collageFrameShapes = ["straight", "torn", "none"] as const;
export type CollageFrameShape = (typeof collageFrameShapes)[number];
export const collageFrameWidths = [12, 16, 20, 24] as const;
export type CollageFrameWidth = (typeof collageFrameWidths)[number];
export const collageRowDirections = ["ascending", "level", "descending", "random"] as const;
export type CollageRowDirection = (typeof collageRowDirections)[number];

export interface MaterialCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MaterialEdit {
  readonly rotation: MaterialRotation;
  readonly crop: MaterialCrop;
  /** A range in the original video, before any edits. */
  readonly trim?: VideoTrim;
}

export interface VideoTrim {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface MaterialEditResult {
  /** SHA-256 of the stored bytes; absent only on files uploaded before content versioning. */
  readonly contentHash?: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly orientation: MaterialOrientation;
  readonly durationSeconds?: number;
}

export interface AppliedMaterialEdit extends MaterialEdit {
  /** Images may have a rendered derivative. Video edits are metadata only. */
  readonly result?: MaterialEditResult;
}

export interface FocusPoint {
  readonly x: number;
  readonly y: number;
}

export interface CollageCardAngle {
  readonly materialId: string;
  readonly angleDegrees: number;
}

export interface CollageCardOffset {
  readonly materialId: string;
  /** Final vertical offset from the centered baseline, in 1080×1920 output pixels. */
  readonly offsetY: number;
}

export interface CollageSettings {
  readonly frame: {
    /** Width in final 1080 px output pixels. */
    readonly width: CollageFrameWidth;
    readonly color: string;
    readonly shape: CollageFrameShape;
  };
  readonly entryDurationSeconds: number;
  /** Left-to-right vertical rhythm for every row containing multiple cards. */
  readonly rowDirection: CollageRowDirection;
  /** User-facing opt-out; individual angles remain hidden implementation data. */
  readonly straightCards: boolean;
  /** Persisted final angles in material order, returned as part of the scene JSON. */
  readonly cardAngles: readonly CollageCardAngle[];
  /** Persisted per-card row rhythm, returned as part of the scene JSON. */
  readonly cardOffsets: readonly CollageCardOffset[];
}

export type EditableCollageSettings = Omit<CollageSettings, "cardAngles" | "cardOffsets" | "rowDirection" | "straightCards"> & {
  /** Optional for backwards-compatible partial editor updates; omitted values preserve the saved direction. */
  readonly rowDirection?: CollageSettings["rowDirection"] | undefined;
  readonly straightCards?: boolean | undefined;
};

export interface AssetRef { readonly id: string; readonly kind: AssetKind }

export interface MaterialFile {
  readonly contentHash?: string;
  readonly id: string;
  readonly name: string;
  readonly orientation: MaterialOrientation;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly edit?: AppliedMaterialEdit;
}

export interface ImageMaterial extends MaterialFile {
  readonly kind: "image";
}

export interface VideoMaterial extends MaterialFile {
  readonly kind: "video";
  readonly hasAudio: boolean;
  readonly sourceDurationSeconds?: number;
  /** Empty tags with hasAudio=true mean the source track still needs classification. */
  readonly audioTags: readonly VideoAudioTag[];
  /** Immutable working tracks; storageKey remains the untouched uploaded original. */
  readonly videoTrack?: VideoTrack;
  readonly audioTrack?: AudioTrack;
}

export interface VideoTrack {
  readonly contentHash?: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number;
}

export interface AudioTrack extends VideoTrack {
  readonly sampleRate: number;
  readonly channels: number;
  readonly processing: {
    readonly version: number;
    readonly filter: string;
    /** Measured on the encoded track; null denotes silence. */
    readonly integratedLufs: number | null;
    readonly truePeakDbfs: number | null;
  };
}

export type SceneMaterial = ImageMaterial | VideoMaterial;
export type NewSceneMaterial = Omit<ImageMaterial, "id"> | Omit<VideoMaterial, "id">;

/** Structural scene background: it is never one of the ordered collage cards. */
export type CollageBackground =
  | { readonly source: "previous-scene" }
  | { readonly source: "material"; readonly material: SceneMaterial };

export function getMaterialPresentation(material: SceneMaterial): MaterialEditResult {
  if (material.kind === "video") {
    const source = getMaterialSource(material);
    const crop = videoPixelCrop(material.width, material.height, material.edit);
    const trim = material.edit?.trim;
    return {
      ...source, width: crop.width, height: crop.height,
      orientation: crop.width < crop.height ? "portrait" : "landscape",
      ...(trim ? { durationSeconds: trim.endSeconds - trim.startSeconds } : {}),
    };
  }
  return material.edit?.result ?? material;
}

/** Displayed dimensions include rotation/crop even before an image derivative is available. */
export function getMaterialDisplaySize(material: SceneMaterial): { readonly width: number; readonly height: number } {
  if (material.edit?.result) return material.edit.result;
  if (!material.edit) return material;
  const sideways = material.edit.rotation === 90 || material.edit.rotation === 270;
  const width = sideways ? material.height : material.width;
  const height = sideways ? material.width : material.height;
  const { crop } = material.edit;
  const left = Math.min(width - 1, Math.floor(crop.x * width));
  const top = Math.min(height - 1, Math.floor(crop.y * height));
  const right = Math.max(left + 1, Math.min(width, Math.ceil((crop.x + crop.width) * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil((crop.y + crop.height) * height)));
  return { width: right - left, height: bottom - top };
}

export function getMaterialSource(material: SceneMaterial): MaterialEditResult {
  return material.kind === "video" && material.videoTrack
    ? { ...material, ...material.videoTrack } : material;
}

export function materialStorageKeys(material: SceneMaterial): string[] {
  return [...new Set([
    material.storageKey, material.edit?.result?.storageKey,
    ...(material.kind === "video" ? [material.videoTrack?.storageKey, material.audioTrack?.storageKey] : []),
  ].filter((key): key is string => Boolean(key)))];
}

/** Align to chroma pixels identically in the preview and the exported video. */
export function videoPixelCrop(sourceWidth: number, sourceHeight: number, edit?: MaterialEdit) {
  const sideways = edit?.rotation === 90 || edit?.rotation === 270;
  const width = sideways ? sourceHeight : sourceWidth;
  const height = sideways ? sourceWidth : sourceHeight;
  const crop = edit?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const usableWidth = width - width % 2;
  const usableHeight = height - height % 2;
  const left = Math.min(usableWidth - 2, Math.floor(crop.x * width / 2) * 2);
  const top = Math.min(usableHeight - 2, Math.floor(crop.y * height / 2) * 2);
  const right = Math.max(left + 2, Math.min(usableWidth, Math.ceil((crop.x + crop.width) * width / 2) * 2));
  const bottom = Math.max(top + 2, Math.min(usableHeight, Math.ceil((crop.y + crop.height) * height / 2) * 2));
  return { left, top, width: right - left, height: bottom - top, rotatedWidth: width, rotatedHeight: height };
}

export type VideoExportMode = "video" | "audio" | "combined";

export interface Scene {
  readonly id: string;
  readonly materials: readonly SceneMaterial[];
  readonly durationSeconds: number;
  readonly layoutId?: string;
  readonly motion: SceneMotion;
  readonly focusPoint?: FocusPoint;
  readonly collage?: CollageSettings;
  readonly collageBackground?: CollageBackground;
  readonly rendererId?: string;
  readonly title?: string;
  readonly render: { readonly status: JobStatus; readonly artifactId?: string };
}

export interface Narration {
  readonly id: string;
  readonly assetId: string;
  readonly fromSceneId: string;
}

export interface Music {
  readonly generationStatus: JobStatus;
  readonly assetId?: string;
  readonly applied: boolean;
}

export interface Story {
  readonly id: string;
  readonly profileId: string;
  readonly title?: string;
  readonly status: StoryStatus;
  readonly scenes: readonly Scene[];
  readonly narrations: readonly Narration[];
  readonly music: Music;
  readonly revision: number;
}

export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly language: ProfileLanguage;
}

export const profileLanguages = ["en", "ru", "sr-Latn", "es"] as const;
export type ProfileLanguage = (typeof profileLanguages)[number];

export interface ProfileUpdate {
  readonly name?: string;
  readonly language?: ProfileLanguage;
}

export const platformProviders = ["telegram", "tiktok", "instagram"] as const;
export type PlatformProvider = (typeof platformProviders)[number];

export interface PlatformCredential {
  readonly id: string;
  readonly profileId: string;
  readonly provider: PlatformProvider;
  readonly externalAccountId?: string;
  /** Secret material is stored server-side and must never be serialized by an API. */
  readonly secret: string;
}
