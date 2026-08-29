export type AnalyticsSurface = "site" | "story-web" | "clip-web";
export type AnalyticsServerZone = "EU" | "US";
export type MaterialKind = "image" | "video";
export type ExportMode = "video" | "audio" | "combined";
export type ExportFailureStage = "request" | "processing" | "download";
export type ExportFailureReason = "version_changed" | "queue_timeout" | "render_timeout" | "api_error" | "unknown";

export interface AnalyticsEventMap {
  readonly "page viewed": { readonly page: string };
  readonly "account created": Record<string, never>;
  readonly "account signed in": Record<string, never>;
  readonly "story created": Record<string, never>;
  readonly "scene created": Record<string, never>;
  readonly "material uploaded": { readonly material_kind: MaterialKind };
  readonly "scene render requested": { readonly export_mode: ExportMode };
  readonly "scene render succeeded": { readonly export_mode: ExportMode };
  readonly "scene exported": { readonly export_mode: ExportMode };
  readonly "scene export failed": {
    readonly export_mode: ExportMode;
    readonly failure_stage: ExportFailureStage;
    readonly failure_reason: ExportFailureReason;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;
type AnalyticsValue = string | number | boolean;
type AdapterProperties = Readonly<Record<string, AnalyticsValue>>;

export const analyticsEventPropertyNames = {
  "page viewed": ["surface", "page"],
  "account created": ["surface"],
  "account signed in": ["surface"],
  "story created": ["surface"],
  "scene created": ["surface"],
  "material uploaded": ["surface", "material_kind"],
  "scene render requested": ["surface", "export_mode"],
  "scene render succeeded": ["surface", "export_mode"],
  "scene exported": ["surface", "export_mode"],
  "scene export failed": ["surface", "export_mode", "failure_stage", "failure_reason"],
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

  const track: ProductAnalytics["track"] = (eventName, properties) => {
    if (!enabled || !surface) return;
    adapter.track(eventName, { surface, ...properties } as AdapterProperties);
  };

  return {
    initialize(configuration) {
      if (enabled) return true;
      const apiKey = configuration.apiKey.trim();
      surface = configuration.surface;
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
      track("page viewed", { page: normalized });
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
