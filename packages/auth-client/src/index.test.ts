import assert from "node:assert/strict";
import test from "node:test";
import { createAuthClient, createGravatarUrl, createSignInPath, profileInitials, resolveContinueTarget, sanitizeContinuePath } from "./index.js";

test("continue paths stay on known same-origin application prefixes", () => {
  assert.equal(sanitizeContinuePath("/app"), "/app");
  assert.equal(sanitizeContinuePath("/app/stories/story-1?tab=edit"), "/app/stories/story-1?tab=edit");
  assert.equal(sanitizeContinuePath("/app/clips"), "/app/clips");
  assert.equal(sanitizeContinuePath("/app/profile"), "/app/profile");
  assert.equal(sanitizeContinuePath("https://example.com/app"), "/app");
  assert.equal(sanitizeContinuePath("//example.com/app"), "/app");
  assert.equal(sanitizeContinuePath("/app/stories\\example.com"), "/app");
  assert.equal(sanitizeContinuePath("/stories/story-1"), "/app");
});

test("builds a privacy-conscious Gravatar URL and derives an initials fallback", async () => {
  assert.equal(profileInitials("  Ada Lovelace "), "AL");
  assert.equal(profileInitials("sergej"), "S");
  assert.equal(profileInitials(""), "?");
  assert.equal(
    await createGravatarUrl("MyEmailAddress@example.com ", 128),
    "https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?d=404&s=128",
  );
});

test("sign-in links encode the validated return path", () => {
  assert.equal(createSignInPath("/app/stories/story 1"), "/sign-in?continue=%2Fapp%2Fstories%2Fstory%201");
  assert.equal(createSignInPath("//example.com"), "/sign-in?continue=%2Fapp");
});

test("admin is a fixed logical return target, never an arbitrary URL", () => {
  assert.equal(resolveContinueTarget("admin", "https://admin.makeitastory.app/"), "https://admin.makeitastory.app");
  assert.equal(resolveContinueTarget("https://evil.example", "https://admin.makeitastory.app"), "/app");
});

test("uses the server result instead of submitted name to classify account creation", async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  let submittedBody: unknown;
  globalThis.fetch = async (_input, init) => {
    submittedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      csrfToken: "csrf-token",
      accountCreated: false,
      expiresAt: "2026-09-28T12:00:00.000Z",
      profile: { id: "profile-id", name: "Existing profile", email: "person@example.com", language: "ru" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await createAuthClient("https://api.example.com").signIn(
    "person@example.com", "long-test-password", "Submitted retry name", "es",
  );

  assert.deepEqual(submittedBody, {
    email: "person@example.com", password: "long-test-password", name: "Submitted retry name", language: "es",
  });
  assert.equal(result.accountCreated, false);
  assert.equal("accountCreated" in result.session, false);
  assert.equal("accessToken" in result.session, false);
  assert.equal(result.session.profile.name, "Existing profile");
  assert.equal(result.session.profile.language, "ru");
});

test("updates the authenticated profile with a PATCH request", async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  let request: { readonly input: string; readonly init?: RequestInit } | undefined;
  globalThis.fetch = async (input, init) => {
    request = { input: String(input), ...(init ? { init } : {}) };
    return new Response(JSON.stringify({
      id: "profile-id", name: "Existing profile", email: "person@example.com", language: "es",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const profile = await createAuthClient("https://api.example.com").updateProfile("csrf-token", { language: "es" });

  assert.equal(request?.input, "https://api.example.com/profile");
  assert.equal(request?.init?.method, "PATCH");
  assert.equal(request?.init?.body, JSON.stringify({ language: "es" }));
  assert.equal(request?.init?.credentials, "include");
  assert.equal(new Headers(request?.init?.headers).get("authorization"), null);
  assert.equal(new Headers(request?.init?.headers).get("x-csrf-token"), "csrf-token");
  assert.equal(profile.language, "es");
});
