import assert from "node:assert/strict";
import test from "node:test";
import type { SceneRender } from "../../api.js";
import { SceneRenderTimeoutError, waitForSceneRender } from "./scene-render-polling.js";

test("waits for queued and running renders, or returns an existing ready render immediately", async () => {
  const controller = new AbortController();
  const statuses: SceneRender["status"][] = ["running", "ready"];
  let polls = 0;
  const options = {
    signal: controller.signal,
    wait: async () => {},
    load: async (id: string, signal: AbortSignal): Promise<SceneRender> => {
      assert.equal(id, "render-1");
      assert.equal(signal, controller.signal);
      return { id, status: statuses[polls++]! };
    },
  };
  const ready = await waitForSceneRender({ id: "render-1", status: "queued" }, options);
  assert.equal(ready.status, "ready");
  assert.equal(polls, 2);
  assert.equal(await waitForSceneRender(ready, options), ready);
  assert.equal(polls, 2);
});

test("stops polling when no worker claims the render or rendering never finishes", async () => {
  for (const status of ["queued", "running"] as const) {
    let now = 0;
    let polls = 0;
    await assert.rejects(waitForSceneRender({ id: "render-1", status }, {
      signal: new AbortController().signal,
      now: () => now,
      wait: async (milliseconds) => { now += milliseconds; },
      load: async (id) => { polls++; return { id, status }; },
      intervalMs: 10, queueTimeoutMs: 20, renderTimeoutMs: 40,
    }), (error) => error instanceof SceneRenderTimeoutError && error.phase === (status === "queued" ? "queue" : "render"));
    assert.equal(polls, status === "queued" ? 2 : 4);
  }
});

test("allows a claimed render to continue beyond the queue deadline", async () => {
  let now = 0;
  const render = await waitForSceneRender({ id: "render-1", status: "queued" }, {
    signal: new AbortController().signal,
    now: () => now,
    wait: async (milliseconds) => { now += milliseconds; },
    load: async (id) => ({ id, status: now >= 30 ? "ready" : "running" }),
    intervalMs: 10, queueTimeoutMs: 20, renderTimeoutMs: 40,
  });
  assert.equal(render.status, "ready");
  assert.equal(now, 30);
});

test("reports failed and canceled renders without polling again", async () => {
  for (const status of ["failed", "canceled"] as const) {
    await assert.rejects(waitForSceneRender({ id: "render-1", status, error: "render stopped" }, {
      signal: new AbortController().signal,
      load: async () => { throw new Error("unexpected poll"); },
    }), /render stopped/);
  }
});

test("aborts the pending delay when leaving or changing a scene", async () => {
  const controller = new AbortController();
  const pending = waitForSceneRender({ id: "render-1", status: "queued" }, {
    signal: controller.signal,
    intervalMs: 60_000,
    load: async () => { throw new Error("unexpected poll"); },
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
