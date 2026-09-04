import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrafficAttribution } from "./traffic-attribution.js";

test("classifies direct, internal, referral and invalid traffic without exposing a domain", () => {
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/", ""), {
    traffic_channel: "direct", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/?utm_source=&gclid=", ""), {
    traffic_channel: "direct", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/ru", "https://makeitastory.app/"), {
    traffic_channel: "internal", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/", "https://example.com/private/path?q=secret"), {
    traffic_channel: "referral", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/", "https://google.evil.example/search?q=private"), {
    traffic_channel: "referral", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("not a url", "https://google.com/search?q=private"), {
    traffic_channel: "unknown", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/", "not a url"), {
    traffic_channel: "unknown", search_engine: "not_applicable",
  });
});

test("maps known organic-search referrers to stable categories", () => {
  const page = "https://makeitastory.app/ru/features";
  for (const [referrer, search_engine] of [
    ["https://www.google.com/search?q=private", "google"],
    ["https://yandex.ru/search/?text=private", "yandex"],
    ["https://cn.bing.com/search?q=private", "bing"],
    ["https://duckduckgo.com/?q=private", "duckduckgo"],
    ["https://search.yahoo.com/search?p=private", "yahoo"],
    ["https://www.baidu.com/s?wd=private", "baidu"],
    ["https://www.ecosia.org/search?q=private", "other"],
  ] as const) {
    assert.deepEqual(resolveTrafficAttribution(page, referrer), { traffic_channel: "organic_search", search_engine });
  }
});

test("classifies paid-search and campaigns from signals without returning their values", () => {
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/?gclid=private", ""), {
    traffic_channel: "paid_search", search_engine: "google",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/?utm_medium=cpc&utm_source=yandex", ""), {
    traffic_channel: "paid_search", search_engine: "yandex",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/?utm_medium=organic&utm_source=google", ""), {
    traffic_channel: "organic_search", search_engine: "google",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/?utm_medium=email&utm_campaign=private", ""), {
    traffic_channel: "campaign", search_engine: "not_applicable",
  });
  assert.deepEqual(resolveTrafficAttribution("https://makeitastory.app/?utm_medium=ppc&utm_source=private-partner", ""), {
    traffic_channel: "paid_search", search_engine: "other",
  });
});
