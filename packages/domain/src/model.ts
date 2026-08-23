export const storyStatuses = ["draft", "rendering", "ready", "publishing", "published"] as const;

export type StoryStatus = (typeof storyStatuses)[number];
export type AssetKind = "image" | "video" | "audio";
export type JobStatus = "idle" | "queued" | "running" | "ready" | "failed";
export type MaterialOrientation = "portrait" | "landscape";
export type VideoAudioTag = "voice" | "music" | "ambient";
export type SceneMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";

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
}

export interface ImageMaterial extends MaterialFile {
  readonly kind: "image";
}

export interface VideoMaterial extends MaterialFile {
  readonly kind: "video";
  readonly hasAudio: boolean;
  /** Empty tags with hasAudio=true mean the source track still needs classification. */
  readonly audioTags: readonly VideoAudioTag[];
}

export type SceneMaterial = ImageMaterial | VideoMaterial;
export type NewSceneMaterial = Omit<ImageMaterial, "id"> | Omit<VideoMaterial, "id">;

export interface Scene {
  readonly id: string;
  readonly materials: readonly SceneMaterial[];
  readonly durationSeconds: number;
  readonly layoutId?: string;
  readonly motion: SceneMotion;
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
