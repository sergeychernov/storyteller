import assert from "node:assert/strict";
import test from "node:test";
import { StoryApplication, type StoryRepository } from "@storyteller/application";
import { buildApi } from "./server.js";

const projectKey = "test-project-key";

test("relays a sanitized analytics batch to the configured Amplitude region", async (context) => {
  const upstreamRequests: { readonly url: string; readonly body: unknown }[] = [];
  const fetchUpstream = (async (input: string | URL | Request, init?: RequestInit) => {
    upstreamRequests.push({ url: String(input), body: JSON.parse(String(init?.body)) as unknown });
    return new Response(JSON.stringify({ code: 200, events_ingested: 2 }), {
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
      }],
    },
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { code: 200, events_ingested: 2 });
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
      }],
    },
  }]);
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

  assert.equal(unknownEvent.statusCode, 400);
  assert.equal(unexpectedProperty.statusCode, 400);
  assert.equal(invalidLanguage.statusCode, 400);
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
