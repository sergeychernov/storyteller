import assert from "node:assert/strict";
import test from "node:test";
import { createSignInPath, sanitizeContinuePath } from "./index.js";

test("continue paths stay on known same-origin application prefixes", () => {
  assert.equal(sanitizeContinuePath("/app"), "/app");
  assert.equal(sanitizeContinuePath("/app/stories/story-1?tab=edit"), "/app/stories/story-1?tab=edit");
  assert.equal(sanitizeContinuePath("/app/clips"), "/app/clips");
  assert.equal(sanitizeContinuePath("https://example.com/app"), "/app");
  assert.equal(sanitizeContinuePath("//example.com/app"), "/app");
  assert.equal(sanitizeContinuePath("/app/stories\\example.com"), "/app");
  assert.equal(sanitizeContinuePath("/stories/story-1"), "/app");
});

test("sign-in links encode the validated return path", () => {
  assert.equal(createSignInPath("/app/stories/story 1"), "/sign-in?continue=%2Fapp%2Fstories%2Fstory%201");
  assert.equal(createSignInPath("//example.com"), "/sign-in?continue=%2Fapp");
});
