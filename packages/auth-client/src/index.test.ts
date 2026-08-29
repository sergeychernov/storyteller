import assert from "node:assert/strict";
import test from "node:test";
import { createAuthClient, createSignInPath, sanitizeContinuePath } from "./index.js";

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

test("uses the server result instead of submitted name to classify account creation", async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  let submittedBody: unknown;
  globalThis.fetch = async (_input, init) => {
    submittedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      accessToken: "access-token",
      accountCreated: false,
      expiresAt: "2026-09-28T12:00:00.000Z",
      profile: { id: "profile-id", name: "Existing profile", email: "person@example.com" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await createAuthClient("https://api.example.com").signIn(
    "person@example.com", "long-test-password", "Submitted retry name",
  );

  assert.deepEqual(submittedBody, {
    email: "person@example.com", password: "long-test-password", name: "Submitted retry name",
  });
  assert.equal(result.accountCreated, false);
  assert.equal("accountCreated" in result.session, false);
  assert.equal(result.session.profile.name, "Existing profile");
});
