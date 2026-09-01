import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductAnalytics, resolveAnalyticsRelayUrl, resolveAnalyticsServerZone, type AnalyticsAdapter,
} from "./core.js";

function fixture(onFlush: () => Promise<void> = () => Promise.resolve()) {
  const calls: { name: string; arguments: readonly unknown[] }[] = [];
  const adapter: AnalyticsAdapter = {
    initialize: (...args) => { calls.push({ name: "initialize", arguments: args }); },
    setUserId: (...args) => { calls.push({ name: "setUserId", arguments: args }); },
    reset: (...args) => { calls.push({ name: "reset", arguments: args }); },
    track: (...args) => { calls.push({ name: "track", arguments: args }); },
    flush: async (...args) => {
      calls.push({ name: "flush", arguments: args });
      await onFlush();
    },
  };
  return { analytics: createProductAnalytics(adapter), calls };
}

test("stays disabled without an API key", () => {
  const { analytics, calls } = fixture();
  assert.equal(analytics.initialize({ apiKey: "  ", serverZone: "EU", surface: "site" }), false);
  analytics.setUser("profile-id");
  analytics.track("account signed in", {});
  analytics.track("profile language changed", { language: "es" });
  analytics.flush();
  assert.deepEqual(calls, []);
});

test("adds the surface and never needs content identifiers", () => {
  const { analytics, calls } = fixture();
  assert.equal(analytics.initialize({ apiKey: "public-key", serverZone: "EU", surface: "story-web" }), true);
  analytics.setUser("profile-id");
  analytics.track("material uploaded", { material_kind: "video" });
  analytics.track("collage background configured", { collage_background_mode: "custom_material_original" });
  analytics.track("collage row direction configured", { collage_row_direction: "random" });
  analytics.track("timeline edited", { timeline_edit_kind: "material_moved_between_scenes" });
  analytics.track("profile language changed", { language: "es" });
  analytics.track("scene render succeeded", {
    export_mode: "combined", renderer_kind: "collage", collage_card_orientation: "angled", collage_media_mix: "includes_video",
  });

  assert.deepEqual(calls, [
    { name: "initialize", arguments: ["public-key", "EU", undefined] },
    { name: "setUserId", arguments: ["profile-id"] },
    { name: "track", arguments: ["material uploaded", { surface: "story-web", material_kind: "video" }] },
    { name: "track", arguments: ["collage background configured", {
      surface: "story-web", collage_background_mode: "custom_material_original",
    }] },
    { name: "track", arguments: ["collage row direction configured", {
      surface: "story-web", collage_row_direction: "random",
    }] },
    { name: "track", arguments: ["timeline edited", {
      surface: "story-web", timeline_edit_kind: "material_moved_between_scenes",
    }] },
    { name: "track", arguments: ["profile language changed", { surface: "story-web", language: "es" }] },
    { name: "track", arguments: ["scene render succeeded", {
      surface: "story-web", export_mode: "combined", renderer_kind: "collage", collage_card_orientation: "angled",
      collage_media_mix: "includes_video",
    }] },
  ]);
});

test("deduplicates the current page and resets identity safely", () => {
  const { analytics, calls } = fixture();
  analytics.initialize({ apiKey: "public-key", serverZone: "US", surface: "site" });
  analytics.setUser("profile-id");
  analytics.setUser("profile-id");
  analytics.trackPage("public:/ru/features");
  analytics.trackPage("public:/ru/features");
  analytics.reset();
  analytics.trackPage("sign-in");

  assert.deepEqual(calls.slice(1), [
    { name: "setUserId", arguments: ["profile-id"] },
    { name: "track", arguments: ["page viewed", { surface: "site", page: "public:/ru/features" }] },
    { name: "reset", arguments: [] },
    { name: "track", arguments: ["page viewed", { surface: "site", page: "sign-in" }] },
  ]);
});

test("defaults unknown regions to EU", () => {
  assert.equal(resolveAnalyticsServerZone(undefined), "EU");
  assert.equal(resolveAnalyticsServerZone("eu"), "EU");
  assert.equal(resolveAnalyticsServerZone("US"), "US");
});

test("normalizes the first-party analytics relay URL", () => {
  assert.equal(resolveAnalyticsRelayUrl(undefined), "http://localhost:3001/analytics/amplitude");
  assert.equal(resolveAnalyticsRelayUrl(" https://api.example.com/ "), "https://api.example.com/analytics/amplitude");
});

test("exposes adapter flush completion to navigation callers", async () => {
  let finishFlush: (() => void) | undefined;
  const adapterCompletion = new Promise<void>((resolve) => { finishFlush = resolve; });
  const { analytics, calls } = fixture(() => adapterCompletion);
  analytics.initialize({ apiKey: "public-key", serverZone: "US", surface: "site" });
  analytics.track("account signed in", {});

  let completed = false;
  const completion = analytics.flush().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(calls.at(-1)?.name, "flush");

  finishFlush?.();
  await completion;
  assert.equal(completed, true);
});
