import { act, render } from "@testing-library/react";
import { buildStoryTimeline } from "@storyteller/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, Story } from "../../api.js";
import { PreviewMediaPreloader } from "./PreviewMediaPreloader.js";
import { previewPreloadPlan } from "./preview-preload-plan.js";

const warmups = vi.hoisted(() => new Map<string, { done: () => void; release: ReturnType<typeof vi.fn> }>());
vi.mock("../editor/use-material-content-url.js", () => ({
  prefersMetadataFirstPreload: () => false,
  useMaterialContentUrl: ({ material }: { material: { id: string } }) => ({ url: material.id, failed: false }),
}));
vi.mock("./preview-media-warmup.js", () => ({ warmPreviewMedia: (url: string, _kind: string, _start: number, done: () => void) => {
  const release = vi.fn(); warmups.set(url, { done, release }); return release;
} }));

const story: Story = {
  id: "story", profileId: "profile", revision: 1, status: "draft", title: "Preview", narrations: [],
  music: { applied: false, generationStatus: "idle" },
  scenes: Array.from({ length: 8 }, (_, index) => ({ id: `scene-${index}`, rendererId: "still-image",
    durationSeconds: 2, motion: "none", render: { status: "idle" },
    materials: [{ id: `image-${index}`, kind: "image", name: "image", storageKey: `image-${index}`, mimeType: "image/png",
      sizeBytes: 100, width: 100, height: 200, orientation: "portrait" }],
  })),
};
const timeline = buildStoryTimeline(story);
const snapshot = { status: "ready", playheadSeconds: 0, currentTimelineIndex: 0, pendingTimelineIndex: undefined,
  retryKey: 0, revisionReset: false } as const;
const session = { profile: { id: "profile" } } as AuthSession;
beforeEach(() => warmups.clear());

describe("preview lookahead", () => {
  it("includes every scene of a three-scene story before Play and bounds longer stories", () => {
    const short = { ...story, scenes: story.scenes.slice(0, 3) };
    expect(previewPreloadPlan(short, buildStoryTimeline(short), 0).map(({ id }) => id)).toHaveLength(3);
    const plan = previewPreloadPlan(story, timeline, 0);
    expect(plan).toHaveLength(5);
    expect(plan.filter(({ warm }) => warm)).toHaveLength(3);
    expect(previewPreloadPlan(story, timeline, 0, true)).toHaveLength(2);
    expect(previewPreloadPlan(story, timeline, 6).map(({ id }) => id)).toEqual(["visual:image-6:image-6", "visual:image-7:image-7"]);
  });
  it("does not retain huge speculative images beyond the byte budget", () => {
    const huge = { ...story, scenes: story.scenes.map((scene) => ({ ...scene, materials: scene.materials.map((material) => ({
      ...material, width: 12000, height: 12000,
    })) })) };
    expect(previewPreloadPlan(huge, buildStoryTimeline(huge), 0)).toHaveLength(2);
  });
  it("warms at most two future resources concurrently and releases them on seek/unmount", () => {
    const view = render(<PreviewMediaPreloader story={story} timeline={timeline} session={session} snapshot={snapshot} />);
    expect([...warmups.keys()]).toEqual(["image-2", "image-3"]);
    act(() => warmups.get("image-2")!.done());
    expect([...warmups.keys()]).toEqual(["image-2", "image-3", "image-4"]);
    view.rerender(<PreviewMediaPreloader story={story} timeline={timeline} session={session}
      snapshot={{ ...snapshot, currentTimelineIndex: 6, playheadSeconds: 12 }} />);
    for (const warmup of warmups.values()) expect(warmup.release).toHaveBeenCalledOnce();
    view.unmount();
  });
});
