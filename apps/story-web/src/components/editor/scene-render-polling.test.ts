import assert from "node:assert/strict";
import test from "node:test";
import type { SceneRender } from "../../api.js";
import { SceneRenderStaleError, SceneRenderTimeoutError, waitForSceneRender } from "./scene-render-polling.js";

test("waits for queued and running renders, or returns an existing ready render immediately", async () => {
  const controller = new AbortController();
  const statuses: SceneRender["status"][] = ["running", "ready"];
  const updates: number[] = [];
  let polls = 0;
  const options = {
    signal: controller.signal,
    wait: async () => {},
    load: async (id: string, signal: AbortSignal): Promise<SceneRender> => {
      assert.equal(id, "render-1");
      assert.equal(signal, controller.signal);
      const status = statuses[polls++]!;
      return { id, current: true, status, progressPercent: status === "ready" ? 100 : 55, progressPhase: status === "ready" ? "ready" : "rendering" };
    },
    onUpdate: (render: SceneRender) => updates.push(render.progressPercent),
  };
  const ready = await waitForSceneRender({ id: "render-1", current: true, status: "queued", progressPercent: 0, progressPhase: "queued" }, options);
  assert.equal(ready.status, "ready");
  assert.equal(polls, 2);
  assert.equal(await waitForSceneRender(ready, options), ready);
  assert.equal(polls, 2);
  assert.deepEqual(updates, [0, 55, 100, 100]);
});

test("stops polling when no worker claims the render or rendering never finishes", async () => {
  for (const status of ["queued", "running"] as const) {
    let now = 0;
    let polls = 0;
    await assert.rejects(waitForSceneRender({ id: "render-1", current: true, status, progressPercent: status === "running" ? 10 : 0, progressPhase: status === "running" ? "rendering" : "queued" }, {
      signal: new AbortController().signal,
      now: () => now,
      wait: async (milliseconds) => { now += milliseconds; },
      load: async (id) => { polls++; return { id, current: true, status, progressPercent: status === "running" ? 10 : 0, progressPhase: status === "running" ? "rendering" : "queued" }; },
      intervalMs: 10, queueTimeoutMs: 20, renderTimeoutMs: 40,
    }), (error) => error instanceof SceneRenderTimeoutError && error.phase === (status === "queued" ? "queue" : "render"));
    assert.equal(polls, status === "queued" ? 2 : 4);
  }
});

test("allows a claimed render to continue beyond the queue deadline", async () => {
  let now = 0;
  const render = await waitForSceneRender({ id: "render-1", current: true, status: "queued", progressPercent: 0, progressPhase: "queued" }, {
    signal: new AbortController().signal,
    now: () => now,
    wait: async (milliseconds) => { now += milliseconds; },
    load: async (id) => now >= 30
      ? ({ id, current: true, status: "ready", progressPercent: 100, progressPhase: "ready" })
      : ({ id, current: true, status: "running", progressPercent: 50, progressPhase: "rendering" }),
    intervalMs: 10, queueTimeoutMs: 20, renderTimeoutMs: 40,
  });
  assert.equal(render.status, "ready");
  assert.equal(now, 30);
});

test("reports failed and canceled renders without polling again", async () => {
  for (const status of ["failed", "canceled"] as const) {
    await assert.rejects(waitForSceneRender({ id: "render-1", current: true, status, error: "render stopped", progressPercent: 0, progressPhase: "queued" }, {
      signal: new AbortController().signal,
      load: async () => { throw new Error("unexpected poll"); },
    }), /render stopped/);
  }
});

test("aborts the pending delay when leaving or changing a scene", async () => {
  const controller = new AbortController();
  const pending = waitForSceneRender({ id: "render-1", current: true, status: "queued", progressPercent: 0, progressPhase: "queued" }, {
    signal: controller.signal,
    intervalMs: 60_000,
    load: async () => { throw new Error("unexpected poll"); },
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("never downloads an obsolete ready file and stops when an edit invalidates a running job", async () => {
  for (const status of ["ready", "queued"] as const) {
    let polls = 0;
    await assert.rejects(waitForSceneRender({ id: "render", status, current: status === "queued", progressPercent: status === "ready" ? 100 : 0, progressPhase: status === "ready" ? "ready" : "queued" }, {
      signal: new AbortController().signal, wait: async () => {},
      load: async (id) => { polls++; return { id, status: "running", current: false, progressPercent: 10, progressPhase: "rendering" }; },
    }), SceneRenderStaleError);
    assert.equal(polls, status === "queued" ? 1 : 0);
  }
});
