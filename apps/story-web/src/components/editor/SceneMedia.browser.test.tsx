import { createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession, VideoMaterial } from "../../api.js";
import { SceneMedia, type SceneMediaHandle } from "./SceneMedia.js";
import type { ScenePlaybackSlot } from "./scene-playback-plan.js";
import type { SceneResourceEvent } from "./scene-resource-model.js";

const lifecycleInstances = vi.hoisted(() => [] as Array<{
  readonly tagName: string;
  readonly prepare: ReturnType<typeof vi.fn>;
  readonly play: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly seek: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly sourceTime: (localTimeSeconds: number) => number;
}>);

vi.mock("./use-material-content-url.js", () => ({
  useMaterialContentUrl: ({ audio }: { readonly audio?: boolean }) => ({
    url: audio ? "blob:scene-audio" : "blob:scene-video", loading: false, failed: false,
  }),
}));

vi.mock("./scene-media-lifecycle.js", () => ({
  createSceneMediaLifecycle: (media: HTMLMediaElement, sourceTime: (localTimeSeconds: number) => number) => {
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

describe("SceneMedia", () => {
  it("uses the shared lifecycle, silences inactive media, and disposes both tracks", () => {
    lifecycleInstances.length = 0;
    const events: SceneResourceEvent[] = [];
    const props = createProps(slot(material));
    const view = render(<SceneMedia {...props} onResourceState={(event) => events.push(event)} />);

    expect(lifecycleInstances.map(({ tagName }) => tagName)).toEqual(["VIDEO", "AUDIO"]);
    expect(lifecycleInstances.every(({ play }) => play.mock.calls.length === 1)).toBe(true);

    view.rerender(<SceneMedia {...props} localTimeSeconds={1.2} onResourceState={(event) => events.push(event)} />);
    expect(lifecycleInstances.every(({ play }) => play.mock.calls.length === 1)).toBe(true);
    expect(lifecycleInstances.every(({ seek }) => seek.mock.calls.at(-1)?.[0] === 1.2)).toBe(true);

    view.rerender(<SceneMedia {...props} active={false} localTimeSeconds={0} onResourceState={(event) => events.push(event)} />);
    expect(lifecycleInstances.every(({ pause }) => pause.mock.calls.length === 1)).toBe(true);
    expect(lifecycleInstances.every(({ seek }) => seek.mock.calls.at(-1)?.[0] === 0)).toBe(true);
    expect(view.container.querySelector<HTMLVideoElement>("video")?.muted).toBe(true);
    expect(view.container.querySelector<HTMLAudioElement>("audio")?.muted).toBe(true);

    view.unmount();
    expect(lifecycleInstances.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });

  it("holds a trimmed video, ignores advisory stalls, and reports real waiting by resource id", () => {
    lifecycleInstances.length = 0;
    const events: SceneResourceEvent[] = [];
    const trimmed = {
      ...material,
      edit: { rotation: 0 as const, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0, endSeconds: 3.06 } },
    };
    const props = createProps(slot(trimmed), 4);
    const view = render(<SceneMedia {...props} onResourceState={(event) => events.push(event)} />);
    const video = view.container.querySelector("video")!;
    const audio = view.container.querySelector("audio")!;

    expect(lifecycleInstances.every(({ play }) => play.mock.calls.length === 0)).toBe(true);
    expect(lifecycleInstances.every(({ sourceTime }) => sourceTime(4) === 3.059)).toBe(true);
    video.dispatchEvent(new Event("waiting"));
    audio.dispatchEvent(new Event("stalled"));
    expect(events.filter(({ state }) => state === "waiting")).toHaveLength(0);

    view.rerender(<SceneMedia {...createProps(slot(trimmed), 2)} onResourceState={(event) => events.push(event)} />);
    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    Object.defineProperty(audio, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    video.dispatchEvent(new Event("waiting"));
    audio.dispatchEvent(new Event("waiting"));
    expect(events.filter(({ state }) => state === "waiting").map(({ resourceId }) => resourceId)).toEqual([
      "layout:0:video:visual", "layout:0:video:audio",
    ]);

    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_ENOUGH_DATA });
    video.dispatchEvent(new Event("stalled"));
    expect(events.filter(({ state }) => state === "waiting")).toHaveLength(2);
  });

  it("exposes audible playback through its lifecycle for a user gesture", () => {
    lifecycleInstances.length = 0;
    const ref = createRef<SceneMediaHandle>();
    render(<SceneMedia ref={ref} {...createProps(slot(material))} onResourceState={() => undefined} />);

    ref.current?.playAudibleFromGesture(2.5);

    expect(lifecycleInstances.find(({ tagName }) => tagName === "AUDIO")?.play).toHaveBeenLastCalledWith(2.5);
  });

  it("ignores a stale pause from the previous playback intent after activating a preloaded scene", () => {
    lifecycleInstances.length = 0;
    const onUnexpectedPause = vi.fn();
    const { audioTrack: _processedAudio, ...nativeAudio } = material;
    const props = createProps(slot(nativeAudio));
    const view = render(<SceneMedia {...props} active={false} onUnexpectedPause={onUnexpectedPause}
      onResourceState={() => undefined} />);
    const video = view.container.querySelector("video")!;

    view.rerender(<SceneMedia {...props} active onUnexpectedPause={onUnexpectedPause}
      onResourceState={() => undefined} />);
    video.dispatchEvent(new Event("pause"));
    expect(onUnexpectedPause).not.toHaveBeenCalled();

    video.dispatchEvent(new Event("playing"));
    video.dispatchEvent(new Event("pause"));
    expect(onUnexpectedPause).toHaveBeenCalledOnce();
  });
});

function slot(value: VideoMaterial): ScenePlaybackSlot {
  return { id: `layout:0:${value.id}`, material: value, index: 0, role: "layout", audioEnabled: true, endBehavior: "hold" };
}

function createProps(value: ScenePlaybackSlot, localTimeSeconds = 1) {
  return {
    storyId: "story-1", session, slot: value, localTimeSeconds,
    playing: true, active: true, muted: false, preload: "auto" as const, retryKey: 0,
    onUnexpectedPause: vi.fn(),
  };
}
