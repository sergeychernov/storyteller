import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient, createBrowserApiClient } from "./index.js";

test("adds default JSON and authorization headers without overriding explicit headers", async () => {
  let captured: RequestInit | undefined;
  const client = createApiClient("https://api.example.com/", async (_input, init) => {
    captured = init;
    return Response.json({ ok: true });
  });

  await client.json("/stories", {
    method: "POST",
    body: JSON.stringify({ title: "Story" }),
    headers: { authorization: "Custom token" },
  }, "access-token");

  const headers = new Headers(captured?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("authorization"), "Custom token");
});

test("does not set multipart content type", async () => {
  let captured: RequestInit | undefined;
  const client = createApiClient("https://api.example.com", async (_input, init) => {
    captured = init;
    return Response.json({ ok: true });
  });
  const form = new FormData();
  form.append("file", new Blob(["image"]), "photo.png");

  await client.json("/upload", { method: "POST", body: form });

  assert.equal(new Headers(captured?.headers).has("content-type"), false);
});

test("browser transport sends cookies and limits CSRF headers to unsafe requests", async () => {
  const captured: RequestInit[] = [];
  const client = createBrowserApiClient("https://api.example.com", async (_input, init) => {
    captured.push(init ?? {});
    return Response.json({ ok: true });
  });

  await client.json("/profile", {}, "csrf-token");
  await client.json("/profile", { method: "PATCH", body: "{}" }, "csrf-token");

  assert.equal(captured[0]?.credentials, "include");
  assert.equal(new Headers(captured[0]?.headers).get("x-csrf-token"), null);
  assert.equal(captured[1]?.credentials, "include");
  assert.equal(new Headers(captured[1]?.headers).get("x-csrf-token"), "csrf-token");
  assert.equal(new Headers(captured[1]?.headers).get("authorization"), null);
});

test("preserves structured API errors", async () => {
  const client = createApiClient("https://api.example.com", async () => Response.json({
    message: "Story changed",
    code: "story_revision_conflict",
  }, { status: 409 }));

  await assert.rejects(client.json("/stories"), (error) => (
    error instanceof ApiError
      && error.message === "Story changed"
      && error.status === 409
      && error.code === "story_revision_conflict"
  ));
});
