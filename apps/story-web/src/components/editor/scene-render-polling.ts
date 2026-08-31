import type { SceneRender } from "../../api.js";

interface RenderPollingOptions {
  readonly signal: AbortSignal;
  readonly load: (renderId: string, signal: AbortSignal) => Promise<SceneRender>;
  readonly now?: () => number;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly intervalMs?: number;
  readonly queueTimeoutMs?: number;
  readonly renderTimeoutMs?: number;
  readonly onUpdate?: (render: SceneRender) => void;
}

export class SceneRenderTimeoutError extends Error {
  constructor(readonly phase: "queue" | "render") { super(`scene render ${phase} timed out`); }
}
export class SceneRenderStaleError extends Error {}

export async function waitForSceneRender(initial: SceneRender, {
  signal, load, now = Date.now, wait = abortableDelay, intervalMs = 800,
  queueTimeoutMs = 60_000, renderTimeoutMs = 5 * 60_000, onUpdate,
}: RenderPollingOptions): Promise<SceneRender> {
  const startedAt = now();
  let render = initial;
  let hasStarted = render.status === "running";
  signal.throwIfAborted();
  if (!render.current) throw new SceneRenderStaleError("scene render is outdated");
  onUpdate?.(render);
  while (render.status === "queued" || render.status === "running") {
    hasStarted ||= render.status === "running";
    const timeout = hasStarted ? renderTimeoutMs : queueTimeoutMs;
    const remaining = timeout - (now() - startedAt);
    if (remaining <= 0) throw new SceneRenderTimeoutError(hasStarted ? "render" : "queue");
    await wait(Math.min(intervalMs, remaining), signal);
    signal.throwIfAborted();
    render = await load(render.id, signal);
    signal.throwIfAborted();
    if (!render.current) throw new SceneRenderStaleError("scene render is outdated");
    onUpdate?.(render);
  }
  if (render.status !== "ready") throw new Error(render.error || "scene render failed");
  return render;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    function abort() {
      clearTimeout(timeout);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
