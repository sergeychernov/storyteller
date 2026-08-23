export const storyStatuses = ["draft", "rendering", "ready", "publishing", "published"] as const;

export type StoryStatus = (typeof storyStatuses)[number];
export type AssetKind = "image" | "video" | "audio";
export type JobStatus = "idle" | "queued" | "running" | "ready" | "failed";

export interface AssetRef { readonly id: string; readonly kind: AssetKind }

export interface Scene {
  readonly id: string;
  readonly materials: readonly AssetRef[];
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
  readonly projectId: string;
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

export interface Project {
  readonly id: string;
  readonly profileId: string;
  readonly name: string;
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
