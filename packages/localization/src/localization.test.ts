import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocale, translate } from "./index.js";

test("normalizes the three supported locale families", () => {
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("ru-RU"), "ru");
  assert.equal(normalizeLocale("sr-Cyrl-RS"), "sr-Latn");
  assert.equal(normalizeLocale("fr-FR"), "en");
});

test("uses locale-specific plural rules", () => {
  assert.equal(translate("en", "web.library.sceneCount", { count: 2 }), "2 scenes");
  assert.equal(translate("ru", "web.library.sceneCount", { count: 2 }), "2 сцены");
  assert.equal(translate("ru", "web.library.sceneCount", { count: 5 }), "5 сцен");
  assert.equal(translate("sr-Latn", "web.library.sceneCount", { count: 2 }), "2 scene");
});
