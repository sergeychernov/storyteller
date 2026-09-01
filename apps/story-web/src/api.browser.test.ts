import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, createStory, getStoryTimeline, uploadSceneMaterial } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Story API transport", () => {
  test("sends JSON with cookie credentials and CSRF and returns the response body", async () => {
    let request: { readonly url: string; readonly init: RequestInit } | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init = {}) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ id: "story-id", sceneCount: 0 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const story = await createStory("csrf-token", "A story");

    expect(story.id).toBe("story-id");
    expect(request?.url).toBe("http://localhost:3001/stories");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.body).toBe(JSON.stringify({ title: "A story" }));
    const headers = new Headers(request?.init.headers);
    expect(headers.get("authorization")).toBe(null);
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(request?.init.credentials).toBe("include");
  });

  test("leaves multipart content type to the browser", async () => {
    let requestInit: RequestInit | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init = {}) => {
      requestInit = init;
      return new Response(JSON.stringify({ id: "story-id", scenes: [] }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    await uploadSceneMaterial("csrf-token", "story-id", "scene-id", new File(["image"], "photo.png", { type: "image/png" }));

    expect(requestInit?.body).toBeInstanceOf(FormData);
    expect(new Headers(requestInit?.headers).has("content-type")).toBe(false);
    expect(new Headers(requestInit?.headers).get("x-csrf-token")).toBe("csrf-token");
  });

  test("reads the server timeline without a request body and disables HTTP caching", async () => {
    let request: { readonly url: string; readonly init: RequestInit } | undefined;
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (input, init = {}) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ storyId: "story-id", revision: 4, sceneOrder: [], scenes: [], totalDurationSeconds: 0,
        transitionOverlapSeconds: 0, warnings: [], formatLimits: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }));

    const timeline = await getStoryTimeline("csrf-token", "story-id");

    expect(timeline.revision).toBe(4);
    expect(request?.url).toBe("http://localhost:3001/stories/story-id/timeline");
    expect(request?.init.method).toBeUndefined();
    expect(request?.init.body).toBeUndefined();
    expect(request?.init.cache).toBe("no-store");
    expect(new Headers(request?.init.headers).get("x-csrf-token")).toBe(null);
    expect(request?.init.credentials).toBe("include");
  });

  test("turns structured API failures into the shared error type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      message: "Story changed",
      code: "story_revision_conflict",
    }), { status: 409, headers: { "content-type": "application/json" } })));

    const error = await createStory("csrf-token", "A story").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw error;
    expect(error.message).toBe("Story changed");
    expect(error.status).toBe(409);
    expect(error.code).toBe("story_revision_conflict");
  });
});
