export const storyStatuses = ["draft", "rendering", "ready", "publishing", "published"] as const;

export type StoryStatus = (typeof storyStatuses)[number];
export type AssetKind = "image" | "video" | "audio";
export type JobStatus = "idle" | "queued" | "running" | "ready" | "failed";
export type MaterialOrientation = "portrait" | "landscape";
export type VideoAudioTag = "voice" | "music" | "ambient";
export type SceneMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type MaterialRotation = 0 | 90 | 180 | 270;

export interface MaterialCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MaterialEdit {
  readonly rotation: MaterialRotation;
  readonly crop: MaterialCrop;
}

export interface MaterialEditResult {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly orientation: MaterialOrientation;
}

export interface AppliedMaterialEdit extends MaterialEdit {
  readonly result: MaterialEditResult;
}

export interface FocusPoint {
  readonly x: number;
  readonly y: number;
}

export interface AssetRef { readonly id: string; readonly kind: AssetKind }

export interface MaterialFile {
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
}

export type SceneMaterial = ImageMaterial | VideoMaterial;
export type NewSceneMaterial = Omit<ImageMaterial, "id"> | Omit<VideoMaterial, "id">;

export function getMaterialPresentation(material: SceneMaterial): MaterialEditResult {
  return material.edit?.result ?? material;
}

export interface Scene {
  readonly id: string;
  readonly materials: readonly SceneMaterial[];
  readonly durationSeconds: number;
  readonly layoutId?: string;
  readonly motion: SceneMotion;
  readonly focusPoint?: FocusPoint;
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
