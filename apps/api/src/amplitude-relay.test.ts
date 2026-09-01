import assert from "node:assert/strict";
import test from "node:test";
import { StoryApplication, type StoryRepository } from "@storyteller/application";
import { buildApi } from "./server.js";
import { inheritBrowserSafeAnalyticsConfiguration } from "./environment.js";

const projectKey = "test-project-key";

test("relays a sanitized analytics batch to the configured Amplitude region", async (context) => {
  const upstreamRequests: { readonly url: string; readonly body: unknown }[] = [];
  const fetchUpstream = (async (input: string | URL | Request, init?: RequestInit) => {
    upstreamRequests.push({ url: String(input), body: JSON.parse(String(init?.body)) as unknown });
    return new Response(JSON.stringify({ code: 200, events_ingested: 7 }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const api = await buildApi(new StoryApplication({} as StoryRepository), {
    amplitudeRelay: { apiKey: projectKey, serverZone: "US", fetch: fetchUpstream },
  });
  context.after(() => api.close());

  const response = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "material uploaded",
        event_properties: { surface: "story-web", material_kind: "video" },
        device_id: "device-1", user_id: "profile-1", time: 1_700_000_000_000, session_id: 123,
        insert_id: "insert-1", event_id: 7, library: "amplitude-ts/2.45.8",
        user_properties: { email: "must-not-pass@example.com" }, ip: "$remote",
      }, {
        event_type: "profile language changed",
        event_properties: { surface: "site", language: "es" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "collage background configured",
        event_properties: { surface: "story-web", collage_background_mode: "custom_material_original" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "collage row direction configured",
        event_properties: { surface: "story-web", collage_row_direction: "random" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "timeline edited",
        event_properties: { surface: "story-web", timeline_edit_kind: "scene_reordered" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "story preview completed",
        event_properties: { surface: "story-web", web_layout: "desktop" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "scene render succeeded",
        event_properties: {
          surface: "story-web", export_mode: "video", renderer_kind: "collage", collage_card_orientation: "angled",
          collage_media_mix: "includes_video",
        },
        device_id: "device-1", user_id: "profile-1",
      }],
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { code: 200, events_ingested: 7 });
  assert.deepEqual(upstreamRequests, [{
    url: "https://api2.amplitude.com/2/httpapi",
    body: {
      api_key: projectKey,
      events: [{
        event_type: "material uploaded",
        event_properties: { surface: "story-web", material_kind: "video" },
        device_id: "device-1", user_id: "profile-1", time: 1_700_000_000_000, session_id: 123,
        insert_id: "insert-1", event_id: 7, library: "amplitude-ts/2.45.8",
      }, {
        event_type: "profile language changed",
        event_properties: { surface: "site", language: "es" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "collage background configured",
        event_properties: { surface: "story-web", collage_background_mode: "custom_material_original" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "collage row direction configured",
        event_properties: { surface: "story-web", collage_row_direction: "random" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "timeline edited",
        event_properties: { surface: "story-web", timeline_edit_kind: "scene_reordered" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "story preview completed",
        event_properties: { surface: "story-web", web_layout: "desktop" },
        device_id: "device-1", user_id: "profile-1",
      }, {
        event_type: "scene render succeeded",
        event_properties: {
          surface: "story-web", export_mode: "video", renderer_kind: "collage", collage_card_orientation: "angled",
          collage_media_mix: "includes_video",
        },
        device_id: "device-1", user_id: "profile-1",
      }],
    },
  }]);
});

test("local API inherits the browser-safe Amplitude configuration without overriding explicit server values", () => {
  const local = {
    VITE_AMPLITUDE_API_KEY: "local-project",
    VITE_AMPLITUDE_SERVER_ZONE: "US",
  } as NodeJS.ProcessEnv;
  inheritBrowserSafeAnalyticsConfiguration(local);
  assert.equal(local.AMPLITUDE_API_KEY, "local-project");
  assert.equal(local.AMPLITUDE_SERVER_ZONE, "US");

  const explicit = {
    AMPLITUDE_API_KEY: "server-project",
    AMPLITUDE_SERVER_ZONE: "EU",
    VITE_AMPLITUDE_API_KEY: "browser-project",
    VITE_AMPLITUDE_SERVER_ZONE: "US",
  } as NodeJS.ProcessEnv;
  inheritBrowserSafeAnalyticsConfiguration(explicit);
  assert.equal(explicit.AMPLITUDE_API_KEY, "server-project");
  assert.equal(explicit.AMPLITUDE_SERVER_ZONE, "EU");
});

test("rejects events and properties outside the analytics taxonomy", async (context) => {
  let upstreamCalls = 0;
  const fetchUpstream = (async () => {
    upstreamCalls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const api = await buildApi(new StoryApplication({} as StoryRepository), {
    amplitudeRelay: { apiKey: projectKey, serverZone: "EU", fetch: fetchUpstream },
  });
  context.after(() => api.close());

  const unknownEvent = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: { api_key: projectKey, events: [{ event_type: "email captured", event_properties: {}, device_id: "device-1" }] },
  });
  const unexpectedProperty = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "story created", device_id: "device-1",
        event_properties: { surface: "story-web", story_id: "private-resource-id" },
      }],
    },
  });
  const invalidLanguage = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "profile language changed", device_id: "device-1",
        event_properties: { surface: "site", language: "free-form-language" },
      }],
    },
  });
  const invalidRendererKind = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "scene render succeeded", device_id: "device-1",
        event_properties: {
          surface: "story-web", export_mode: "video", renderer_kind: "custom-value", collage_card_orientation: "angled",
          collage_media_mix: "images_only",
        },
      }],
    },
  });
  const invalidCardOrientation = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "scene render succeeded", device_id: "device-1",
        event_properties: {
          surface: "story-web", export_mode: "video", renderer_kind: "collage", collage_card_orientation: "free-form",
          collage_media_mix: "images_only",
        },
      }],
    },
  });
  const invalidMediaMix = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "scene render succeeded", device_id: "device-1",
        event_properties: {
          surface: "story-web", export_mode: "video", renderer_kind: "collage", collage_card_orientation: "angled",
          collage_media_mix: "free-form",
        },
      }],
    },
  });
  const invalidBackgroundMode = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "collage background configured", device_id: "device-1",
        event_properties: { surface: "story-web", collage_background_mode: "material-id-or-free-form" },
      }],
    },
  });
  const invalidRowDirection = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "collage row direction configured", device_id: "device-1",
        event_properties: { surface: "story-web", collage_row_direction: "material-id-or-free-form" },
      }],
    },
  });
  const invalidTimelineEditKind = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "timeline edited", device_id: "device-1",
        event_properties: { surface: "story-web", timeline_edit_kind: "scene-or-material-id" },
      }],
    },
  });
  const invalidWebLayout = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: {
      api_key: projectKey,
      events: [{
        event_type: "story preview completed", device_id: "device-1",
        event_properties: { surface: "story-web", web_layout: "story-or-device-id" },
      }],
    },
  });

  assert.equal(unknownEvent.statusCode, 400);
  assert.equal(unexpectedProperty.statusCode, 400);
  assert.equal(invalidLanguage.statusCode, 400);
  assert.equal(invalidRendererKind.statusCode, 400);
  assert.equal(invalidCardOrientation.statusCode, 400);
  assert.equal(invalidMediaMix.statusCode, 400);
  assert.equal(invalidBackgroundMode.statusCode, 400);
  assert.equal(invalidRowDirection.statusCode, 400);
  assert.equal(invalidTimelineEditKind.statusCode, 400);
  assert.equal(invalidWebLayout.statusCode, 400);
  assert.equal(upstreamCalls, 0);
});

test("keeps the relay unavailable until the server project key is configured", async (context) => {
  const api = await buildApi(new StoryApplication({} as StoryRepository), {
    amplitudeRelay: { apiKey: "" },
  });
  context.after(() => api.close());

  const response = await api.inject({
    method: "POST", url: "/analytics/amplitude",
    payload: { api_key: projectKey, events: [] },
  });
  assert.equal(response.statusCode, 503);
});
