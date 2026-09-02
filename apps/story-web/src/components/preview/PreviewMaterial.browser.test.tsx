import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession, VideoMaterial } from "../../api.js";
import { PreviewMaterial } from "./PreviewMaterial.js";

const lifecycleInstances = vi.hoisted(() => [] as Array<{
  readonly tagName: string;
  readonly prepare: ReturnType<typeof vi.fn>;
  readonly play: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly seek: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly sourceTime: (localTimeSeconds: number) => number;
}>);

vi.mock("./use-preview-resource-url.js", () => ({
  usePreviewResourceUrl: ({ audio }: { readonly audio?: boolean }) => ({
    url: audio ? "blob:preview-audio" : "blob:preview-video", loading: false, failed: false,
  }),
}));

vi.mock("./preview-renderer-lifecycle.js", () => ({
  createMediaRendererLifecycle: (media: HTMLMediaElement, sourceTime: (localTimeSeconds: number) => number) => {
    const lifecycle = {
      tagName: media.tagName,
      prepare: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      seek: vi.fn(),
      dispose: vi.fn(),
      sourceTime,
    };
    lifecycleInstances.push(lifecycle);
    return lifecycle;
  },
}));

const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;

const material: VideoMaterial = {
  id: "video", kind: "video", name: "video.mp4", orientation: "portrait", storageKey: "original.mp4",
  mimeType: "video/mp4", sizeBytes: 100, width: 1080, height: 1920,
  hasAudio: true, audioTags: [], sourceDurationSeconds: 10,
  videoTrack: { storageKey: "video.mp4", mimeType: "video/mp4", sizeBytes: 80, durationSeconds: 10 },
  audioTrack: {
    storageKey: "audio.m4a", mimeType: "audio/mp4", sizeBytes: 20, durationSeconds: 10,
    sampleRate: 48_000, channels: 2,
    processing: { version: 1, filter: "anull", integratedLufs: -16, truePeakDbfs: -1 },
  },
};

describe("PreviewMaterial", () => {
  it("synchronously silences an inactive scene and disposes both of its media clocks", () => {
    lifecycleInstances.length = 0;
    const callbacks = {
      onReady: vi.fn(), onWaiting: vi.fn(), onFailed: vi.fn(), onUnexpectedPause: vi.fn(),
    };
    const props = {
      storyId: "story-1", session, material, localTimeSeconds: 1, sceneDurationSeconds: 10,
      status: "playing" as const, active: true, muted: false, audioEnabled: true, loopVideo: false,
      preload: "auto" as const, retryKey: 0, ...callbacks,
    };
    const view = render(<PreviewMaterial {...props} />);

    expect(lifecycleInstances.map(({ tagName }) => tagName)).toEqual(["VIDEO", "AUDIO"]);
    expect(lifecycleInstances.every(({ play }) => play.mock.calls.length === 1)).toBe(true);

    view.rerender(<PreviewMaterial {...props} active={false} localTimeSeconds={0} />);
    expect(lifecycleInstances.every(({ pause }) => pause.mock.calls.length === 1)).toBe(true);
    expect(lifecycleInstances.every(({ seek }) => seek.mock.calls.at(-1)?.[0] === 0)).toBe(true);
    expect(view.container.querySelector<HTMLVideoElement>("video")?.muted).toBe(true);
    expect(view.container.querySelector<HTMLAudioElement>("audio")?.muted).toBe(true);

    view.unmount();
    expect(lifecycleInstances.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });

  it("pauses a non-looping trimmed video on its final frame while the scene continues", () => {
    lifecycleInstances.length = 0;
    const trimmed = {
      ...material,
      edit: { rotation: 0 as const, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0, endSeconds: 3.06 } },
    };
    const view = render(<PreviewMaterial
      storyId="story-1"
      session={session}
      material={trimmed}
      localTimeSeconds={4}
      sceneDurationSeconds={5}
      status="playing"
      active
      muted={false}
      audioEnabled
      loopVideo={false}
      preload="auto"
      retryKey={0}
      onReady={vi.fn()}
      onWaiting={vi.fn()}
      onFailed={vi.fn()}
      onUnexpectedPause={vi.fn()}
    />);

    expect(lifecycleInstances).toHaveLength(2);
    expect(lifecycleInstances.every(({ play }) => play.mock.calls.length === 0)).toBe(true);
    expect(lifecycleInstances.every(({ pause }) => pause.mock.calls.length === 1)).toBe(true);
    expect(lifecycleInstances.every(({ seek }) => seek.mock.calls.at(-1)?.[0] === 4)).toBe(true);
    expect(lifecycleInstances.every(({ sourceTime }) => sourceTime(4) === 3.059)).toBe(true);
    view.unmount();
  });
});
