import {
  analyticsEventPropertyNames, resolveAnalyticsServerZone, type AnalyticsEventName, type AnalyticsServerZone,
} from "@storyteller/analytics";
import type { FastifyInstance } from "fastify";

const ingestionEndpoints: Readonly<Record<AnalyticsServerZone, string>> = {
  EU: "https://api.eu.amplitude.com/2/httpapi",
  US: "https://api2.amplitude.com/2/httpapi",
};
const allowedSurfaces = new Set(["site", "story-web", "clip-web"]);
const allowedMaterialKinds = new Set(["image", "video"]);
const allowedLanguages = new Set(["en", "ru", "sr-Latn", "es"]);
const allowedExportModes = new Set(["video", "audio", "combined"]);
const allowedRendererKinds = new Set(["still_image", "video", "collage"]);
const allowedCollageCardOrientations = new Set(["angled", "straight", "not_applicable"]);
const allowedCollageMediaMixes = new Set(["images_only", "includes_video", "not_applicable"]);
const allowedCollageBackgroundModes = new Set(["previous_scene_darkened", "custom_material_original"]);
const allowedCollageRowDirections = new Set(["ascending", "level", "descending", "random"]);
const allowedTimelineEditKinds = new Set(["scene_reordered", "material_moved_between_scenes"]);
const allowedSceneTitleChangeKinds = new Set(["added", "text", "position", "appearance", "timing", "removed"]);
const allowedWebLayouts = new Set(["desktop", "mobile_web"]);
const allowedStoryOutputProfiles = new Set(["vertical_social"]);
const allowedTrafficChannels = new Set([
  "direct", "organic_search", "paid_search", "campaign", "referral", "internal", "unknown",
]);
const allowedSearchEngines = new Set([
  "google", "yandex", "bing", "duckduckgo", "yahoo", "baidu", "other", "not_applicable",
]);
const allowedFailureStages = new Set(["request", "processing", "download"]);
const allowedFailureReasons = new Set(["version_changed", "queue_timeout", "render_timeout", "api_error", "unknown"]);
const safePage = /^[a-z0-9:/_-]+$/;
const maximumBatchSize = 100;

export interface AmplitudeRelayOptions {
  readonly apiKey?: string;
  readonly serverZone?: AnalyticsServerZone;
  readonly fetch?: typeof fetch;
}

interface AmplitudeEvent {
  readonly event_type: AnalyticsEventName;
  readonly event_properties: Readonly<Record<string, string | number | boolean>>;
  readonly device_id?: string;
  readonly user_id?: string;
  readonly time?: number;
  readonly session_id?: number;
  readonly insert_id?: string;
  readonly event_id?: number;
  readonly sequence_number?: number;
  readonly platform?: string;
  readonly language?: string;
  readonly os_name?: string;
  readonly os_version?: string;
  readonly device_model?: string;
  readonly device_manufacturer?: string;
  readonly carrier?: string;
  readonly library?: string;
}

interface AmplitudePayload {
  readonly api_key: string;
  readonly events: readonly AmplitudeEvent[];
}

type ValidationResult =
  | { readonly ok: true; readonly payload: AmplitudePayload }
  | { readonly ok: false; readonly message: string };

export function registerAmplitudeRelayRoutes(instance: FastifyInstance, options: AmplitudeRelayOptions = {}): void {
  const apiKey = (options.apiKey ?? process.env.AMPLITUDE_API_KEY ?? "").trim();
  const serverZone = options.serverZone ?? resolveAnalyticsServerZone(process.env.AMPLITUDE_SERVER_ZONE);
  const fetchUpstream = options.fetch ?? fetch;

  instance.post("/analytics/amplitude", {
    bodyLimit: 256 * 1024,
    schema: {
      operationId: "relayAmplitudeEvents",
      summary: "Relay allowlisted product analytics events",
      description: "Forwards only the documented Storyteller event taxonomy and privacy-safe properties to the configured Amplitude project.",
    },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!apiKey) return reply.status(503).send({ message: "analytics relay is not configured" });

    const validation = sanitizeAmplitudePayload(request.body, apiKey);
    if (!validation.ok) return reply.status(400).send({ message: validation.message });

    let upstream: Response;
    try {
      upstream = await fetchUpstream(ingestionEndpoints[serverZone], {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(validation.payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      request.log.warn({ err: error }, "Amplitude relay request failed");
      return reply.status(502).send({ message: "analytics ingestion is unavailable" });
    }

    const responseText = await upstream.text();
    const responseBody = parseUpstreamResponse(responseText, upstream.ok);
    return reply.status(upstream.status).send(responseBody);
  });
}

export function sanitizeAmplitudePayload(value: unknown, configuredApiKey: string): ValidationResult {
  if (!isRecord(value)) return { ok: false, message: "analytics payload must be an object" };
  if (value.api_key !== configuredApiKey) return { ok: false, message: "analytics project key does not match" };
  if (!Array.isArray(value.events) || value.events.length === 0 || value.events.length > maximumBatchSize) {
    return { ok: false, message: `analytics payload must contain 1 to ${maximumBatchSize} events` };
  }

  const events: AmplitudeEvent[] = [];
  for (const candidate of value.events) {
    const result = sanitizeAmplitudeEvent(candidate);
    if (!result.ok) return result;
    events.push(result.event);
  }
  return { ok: true, payload: { api_key: configuredApiKey, events } };
}

function sanitizeAmplitudeEvent(value: unknown):
  | { readonly ok: true; readonly event: AmplitudeEvent }
  | { readonly ok: false; readonly message: string } {
  if (!isRecord(value) || typeof value.event_type !== "string" || !Object.hasOwn(analyticsEventPropertyNames, value.event_type)) {
    return { ok: false, message: "analytics event type is not allowed" };
  }
  const eventType = value.event_type as AnalyticsEventName;
  const properties = sanitizeEventProperties(eventType, value.event_properties);
  if (!properties.ok) return properties;

  const deviceId = optionalString(value.device_id, 256);
  const userId = optionalString(value.user_id, 128);
  if (deviceId === false || userId === false || (!deviceId && !userId)) {
    return { ok: false, message: "analytics event identity is invalid" };
  }

  const numericFields = ["time", "session_id", "event_id", "sequence_number"] as const;
  for (const field of numericFields) {
    if (value[field] !== undefined && (typeof value[field] !== "number" || !Number.isFinite(value[field]))) {
      return { ok: false, message: `analytics event ${field} is invalid` };
    }
  }

  const event: Record<string, unknown> = { event_type: eventType, event_properties: properties.value };
  copyDefined(event, "device_id", deviceId);
  copyDefined(event, "user_id", userId);
  for (const field of numericFields) copyDefined(event, field, value[field]);
  for (const [field, maximumLength] of [
    ["insert_id", 128], ["platform", 64], ["language", 32], ["os_name", 64], ["os_version", 64],
    ["device_model", 128], ["device_manufacturer", 128], ["carrier", 128], ["library", 128],
  ] as const) {
    const sanitized = optionalString(value[field], maximumLength);
    if (sanitized === false) return { ok: false, message: `analytics event ${field} is invalid` };
    copyDefined(event, field, sanitized);
  }
  return { ok: true, event: event as unknown as AmplitudeEvent };
}

function sanitizeEventProperties(eventType: AnalyticsEventName, value: unknown):
  | { readonly ok: true; readonly value: Readonly<Record<string, string | number | boolean>> }
  | { readonly ok: false; readonly message: string } {
  if (!isRecord(value)) return { ok: false, message: "analytics event properties must be an object" };
  const allowedNames: readonly string[] = analyticsEventPropertyNames[eventType];
  const names = Object.keys(value);
  if (names.length !== allowedNames.length || names.some((name) => !allowedNames.includes(name))) {
    return { ok: false, message: `analytics properties for ${eventType} do not match the taxonomy` };
  }
  if (!allowedSurfaces.has(value.surface as string)) return { ok: false, message: "analytics surface is invalid" };
  if (eventType === "page viewed") {
    if (!isSafeString(value.page, 160, safePage)) return { ok: false, message: "analytics page is invalid" };
    if (!allowedTrafficChannels.has(value.traffic_channel as string)) {
      return { ok: false, message: "analytics traffic channel is invalid" };
    }
    if (!allowedSearchEngines.has(value.search_engine as string)) {
      return { ok: false, message: "analytics search engine is invalid" };
    }
    const isSearch = value.traffic_channel === "organic_search" || value.traffic_channel === "paid_search";
    if (isSearch === (value.search_engine === "not_applicable")) {
      return { ok: false, message: "analytics search attribution is inconsistent" };
    }
  }
  if (eventType === "material uploaded" && !allowedMaterialKinds.has(value.material_kind as string)) {
    return { ok: false, message: "analytics material kind is invalid" };
  }
  if (eventType === "profile language changed" && !allowedLanguages.has(value.language as string)) {
    return { ok: false, message: "analytics language is invalid" };
  }
  if (eventType === "collage background configured" && !allowedCollageBackgroundModes.has(value.collage_background_mode as string)) {
    return { ok: false, message: "analytics collage background mode is invalid" };
  }
  if (eventType === "collage row direction configured" && !allowedCollageRowDirections.has(value.collage_row_direction as string)) {
    return { ok: false, message: "analytics collage row direction is invalid" };
  }
  if (eventType === "timeline edited" && !allowedTimelineEditKinds.has(value.timeline_edit_kind as string)) {
    return { ok: false, message: "analytics timeline edit kind is invalid" };
  }
  if (eventType === "scene title changed" && !allowedSceneTitleChangeKinds.has(value.title_change_kind as string)) {
    return { ok: false, message: "analytics scene title change kind is invalid" };
  }
  if (eventType === "story preview completed" && !allowedWebLayouts.has(value.web_layout as string)) {
    return { ok: false, message: "analytics web layout is invalid" };
  }
  if (eventType.includes("scene render") || eventType.includes("scene export")) {
    if (!allowedExportModes.has(value.export_mode as string)) return { ok: false, message: "analytics export mode is invalid" };
    if (!allowedRendererKinds.has(value.renderer_kind as string)) return { ok: false, message: "analytics renderer kind is invalid" };
    if (!allowedCollageCardOrientations.has(value.collage_card_orientation as string)) {
      return { ok: false, message: "analytics collage card orientation is invalid" };
    }
    if (!allowedCollageMediaMixes.has(value.collage_media_mix as string)) {
      return { ok: false, message: "analytics collage media mix is invalid" };
    }
  }
  if (eventType === "story exported" && !allowedStoryOutputProfiles.has(value.output_profile as string)) {
    return { ok: false, message: "analytics story output profile is invalid" };
  }
  if (eventType === "scene export failed") {
    if (!allowedFailureStages.has(value.failure_stage as string)) return { ok: false, message: "analytics failure stage is invalid" };
    if (!allowedFailureReasons.has(value.failure_reason as string)) return { ok: false, message: "analytics failure reason is invalid" };
  }
  return { ok: true, value: value as Readonly<Record<string, string | number | boolean>> };
}

function optionalString(value: unknown, maximumLength: number): string | undefined | false {
  if (value === undefined || value === null || value === "") return undefined;
  return isSafeString(value, maximumLength) ? value : false;
}

function isSafeString(value: unknown, maximumLength: number, pattern?: RegExp): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength && (!pattern || pattern.test(value));
}

function copyDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUpstreamResponse(value: string, accepted: boolean): unknown {
  if (!value) return accepted ? { code: 200 } : { message: "analytics ingestion rejected the request" };
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return accepted ? { code: 200 } : { message: "analytics ingestion rejected the request" };
  }
}
