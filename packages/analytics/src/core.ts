import type { TrafficAttribution } from "./traffic-attribution.js";

export type AnalyticsSurface = "site" | "story-web" | "clip-web";
export type AnalyticsServerZone = "EU" | "US";
export type MaterialKind = "image" | "video";
export type ExportMode = "video" | "audio" | "combined";
export type RendererKind = "still_image" | "video" | "collage";
export type CollageCardOrientation = "angled" | "straight" | "not_applicable";
export type CollageMediaMix = "images_only" | "includes_video" | "not_applicable";
export type CollageBackgroundMode = "previous_scene_darkened" | "custom_material_original";
export type CollageRowDirection = "ascending" | "level" | "descending" | "random";
export type TimelineEditKind = "scene_reordered" | "material_moved_between_scenes";
export type SceneTitleChangeKind = "added" | "text" | "position" | "appearance" | "timing" | "removed";
export type ExportFailureStage = "request" | "processing" | "download";
export type ExportFailureReason = "version_changed" | "queue_timeout" | "render_timeout" | "api_error" | "unknown";
export type AnalyticsLanguage = "en" | "ru" | "sr-Latn" | "es";
export type WebLayout = "desktop" | "mobile_web";
export type StoryOutputProfile = "vertical_social";

export interface AnalyticsEventMap {
  readonly "page viewed": { readonly page: string } & TrafficAttribution;
  readonly "account created": Record<string, never>;
  readonly "account signed in": Record<string, never>;
  readonly "profile language changed": { readonly language: AnalyticsLanguage };
  readonly "story created": Record<string, never>;
  readonly "scene created": Record<string, never>;
  readonly "material uploaded": { readonly material_kind: MaterialKind };
  readonly "collage background configured": { readonly collage_background_mode: CollageBackgroundMode };
  readonly "collage row direction configured": { readonly collage_row_direction: CollageRowDirection };
  readonly "timeline edited": { readonly timeline_edit_kind: TimelineEditKind };
  readonly "scene title changed": { readonly title_change_kind: SceneTitleChangeKind };
  readonly "story preview completed": { readonly web_layout: WebLayout };
  readonly "story exported": { readonly output_profile: StoryOutputProfile };
  readonly "scene render requested": {
    readonly export_mode: ExportMode; readonly renderer_kind: RendererKind;
    readonly collage_card_orientation: CollageCardOrientation;
    readonly collage_media_mix: CollageMediaMix;
  };
  readonly "scene render succeeded": {
    readonly export_mode: ExportMode; readonly renderer_kind: RendererKind;
    readonly collage_card_orientation: CollageCardOrientation;
    readonly collage_media_mix: CollageMediaMix;
  };
  readonly "scene exported": {
    readonly export_mode: ExportMode; readonly renderer_kind: RendererKind;
    readonly collage_card_orientation: CollageCardOrientation;
    readonly collage_media_mix: CollageMediaMix;
  };
  readonly "scene export failed": {
    readonly export_mode: ExportMode;
    readonly renderer_kind: RendererKind;
    readonly collage_card_orientation: CollageCardOrientation;
    readonly collage_media_mix: CollageMediaMix;
    readonly failure_stage: ExportFailureStage;
    readonly failure_reason: ExportFailureReason;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;
type AnalyticsValue = string | number | boolean;
type AdapterProperties = Readonly<Record<string, AnalyticsValue>>;

export const analyticsEventPropertyNames = {
  "page viewed": ["surface", "page", "traffic_channel", "search_engine"],
  "account created": ["surface"],
  "account signed in": ["surface"],
  "profile language changed": ["surface", "language"],
  "story created": ["surface"],
  "scene created": ["surface"],
  "material uploaded": ["surface", "material_kind"],
  "collage background configured": ["surface", "collage_background_mode"],
  "collage row direction configured": ["surface", "collage_row_direction"],
  "timeline edited": ["surface", "timeline_edit_kind"],
  "scene title changed": ["surface", "title_change_kind"],
  "story preview completed": ["surface", "web_layout"],
  "story exported": ["surface", "output_profile"],
  "scene render requested": ["surface", "export_mode", "renderer_kind", "collage_card_orientation", "collage_media_mix"],
  "scene render succeeded": ["surface", "export_mode", "renderer_kind", "collage_card_orientation", "collage_media_mix"],
  "scene exported": ["surface", "export_mode", "renderer_kind", "collage_card_orientation", "collage_media_mix"],
  "scene export failed": [
    "surface", "export_mode", "renderer_kind", "collage_card_orientation", "collage_media_mix", "failure_stage", "failure_reason",
  ],
} as const satisfies Readonly<Record<AnalyticsEventName, readonly string[]>>;

export interface AnalyticsAdapter {
  readonly initialize: (apiKey: string, serverZone: AnalyticsServerZone, relayUrl: string | undefined) => void;
  readonly setUserId: (profileId: string | undefined) => void;
  readonly reset: () => void;
  readonly track: (eventName: string, properties: AdapterProperties) => void;
  readonly flush: () => Promise<void>;
}

export interface AnalyticsConfiguration {
  readonly apiKey: string;
  readonly serverZone: AnalyticsServerZone;
  readonly surface: AnalyticsSurface;
  readonly trafficAttribution: TrafficAttribution;
  readonly relayUrl?: string;
}

export interface ProductAnalytics {
  readonly initialize: (configuration: AnalyticsConfiguration) => boolean;
  readonly setUser: (profileId: string | undefined) => void;
  readonly reset: () => void;
  readonly track: <Name extends AnalyticsEventName>(eventName: Name, properties: AnalyticsEventMap[Name]) => void;
  readonly trackPage: (page: string) => void;
  readonly flush: () => Promise<void>;
}

export function createProductAnalytics(adapter: AnalyticsAdapter): ProductAnalytics {
  let enabled = false;
  let surface: AnalyticsSurface | undefined;
  let currentProfileId: string | undefined;
  let identityInitialized = false;
  let lastPage: string | undefined;
  let trafficAttribution: TrafficAttribution | undefined;

  const track: ProductAnalytics["track"] = (eventName, properties) => {
    if (!enabled || !surface) return;
    adapter.track(eventName, { surface, ...properties } as AdapterProperties);
  };

  return {
    initialize(configuration) {
      if (enabled) return true;
      const apiKey = configuration.apiKey.trim();
      surface = configuration.surface;
      trafficAttribution = configuration.trafficAttribution;
      if (!apiKey) return false;
      adapter.initialize(apiKey, configuration.serverZone, configuration.relayUrl?.trim() || undefined);
      enabled = true;
      return true;
    },
    setUser(profileId) {
      if (!enabled) return;
      const normalized = profileId?.trim() || undefined;
      if (identityInitialized && normalized === currentProfileId) return;
      adapter.setUserId(normalized);
      currentProfileId = normalized;
      identityInitialized = true;
    },
    reset() {
      if (!enabled) return;
      adapter.reset();
      currentProfileId = undefined;
      identityInitialized = true;
      lastPage = undefined;
    },
    track,
    trackPage(page) {
      const normalized = page.trim();
      if (!normalized || normalized === lastPage) return;
      lastPage = normalized;
      track("page viewed", {
        page: normalized,
        ...(trafficAttribution ?? { traffic_channel: "unknown", search_engine: "not_applicable" }),
      });
    },
    flush() {
      return enabled ? adapter.flush() : Promise.resolve();
    },
  };
}

export function resolveAnalyticsServerZone(value: string | undefined): AnalyticsServerZone {
  return value?.toUpperCase() === "US" ? "US" : "EU";
}

export function resolveAnalyticsRelayUrl(apiUrl: string | undefined): string {
  return `${(apiUrl?.trim() || "http://localhost:3001").replace(/\/+$/, "")}/analytics/amplitude`;
}
