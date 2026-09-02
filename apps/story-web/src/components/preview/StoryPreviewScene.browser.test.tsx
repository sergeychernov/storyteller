import { act, fireEvent, render } from "@testing-library/react";
import { forwardRef } from "react";
import {
  createCollageCardAngles, createCollageCardOffsets, defaultCollageSettings,
} from "@storyteller/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession, ImageMaterial, Scene, VideoMaterial } from "../../api.js";
import { getEditorCopy } from "../editor/editor-copy.js";
import { SceneRendererPreview } from "../editor/SceneRenderer.js";
import { StoryPreviewScene } from "./StoryPreviewScene.js";

vi.mock("../editor/SceneMedia.js", () => ({
  SceneMedia: forwardRef(({ slot, onResourceState }: {
    readonly slot: { id: string; material: ImageMaterial | VideoMaterial; endBehavior: string };
    readonly onResourceState: (event: { resourceId: string; state: "ready" }) => void;
  }, _ref) => <button data-scene-media={slot.material.id} data-end-behavior={slot.endBehavior}
    onClick={() => onResourceState({ resourceId: `${slot.id}:visual`, state: "ready" })} />),
}));
vi.mock("../editor/use-scene-frame-url.js", () => ({
  useSceneFrameUrl: () => ({ url: undefined, loading: true, failed: false, supported: true }),
}));

const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;

describe("StoryPreviewScene", () => {
  it("uses the exact editor frame renderer for an off-center still-image zoom", () => {
    let animationFrame: FrameRequestCallback | undefined;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    try {
      const scene: Scene = {
        id: "still", rendererId: "still-image", layoutId: "full-frame", materials: [photo("still", "portrait")],
        durationSeconds: 5, motion: "zoom-in", focusPoint: { x: 0.592, y: 0.825 }, render: { status: "idle" },
      };
      const editor = render(<SceneRendererPreview
        scene={scene}
        copy={getEditorCopy("en")}
        storyId="story-1"
        session={session}
        active
        saving={false}
      />);
      act(() => animationFrame?.(2_500));

      const preview = render(<StoryPreviewScene
        storyId="story-1"
        session={session}
        scene={scene}
        timelineIndex={0}
        localTimeSeconds={2.5}
        status="paused"
        active
        pending={false}
        muted
        reducedMotion={false}
        retryKey={0}
        copy={getEditorCopy("en")}
        onReady={vi.fn()}
        onWaiting={vi.fn()}
        onFailed={vi.fn()}
        onUnexpectedPause={vi.fn()}
      />);

      const editorFrame = editor.container.querySelector<HTMLElement>("[data-scene-frame-still-media]");
      const previewFrame = preview.container.querySelector<HTMLElement>("[data-scene-frame-still-media]");
      expect(editorFrame?.style.transform).toBe(previewFrame?.style.transform);
      expect(editorFrame?.style.transform).not.toContain("scale(1)");
      expect(editorFrame?.style.transformOrigin).toBe("0 0");
      expect(previewFrame?.style.transformOrigin).toBe("0 0");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("keeps reduced-motion collage timing while removing moving entrances", () => {
    const materials = [photo("first"), photo("second")];
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "collage", rendererId: "collage", layoutId: "stack", materials, durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({ layoutId: "stack", materials, straightCards: false, seedKey: "preview" }),
        cardOffsets: createCollageCardOffsets({ layoutId: "stack", materials, direction: defaults.rowDirection, seedKey: "preview" }),
      },
      render: { status: "idle" },
    };
    const props = {
      storyId: "story-1", session, scene, timelineIndex: 0, status: "playing" as const, active: true, pending: false,
      muted: true, reducedMotion: true, retryKey: 0, copy: getEditorCopy("en"),
      onReady: vi.fn(), onWaiting: vi.fn(), onFailed: vi.fn(), onUnexpectedPause: vi.fn(),
    };
    const { container, rerender } = render(<StoryPreviewScene {...props} localTimeSeconds={0} />);
    const initialCards = [...container.querySelectorAll<HTMLElement>("[data-collage-card]")];
    expect(initialCards).toHaveLength(2);
    expect(initialCards.some(({ style }) => style.visibility === "hidden")).toBe(true);
    expect(initialCards.every(({ style }) => !style.transform.includes("translate"))).toBe(true);

    rerender(<StoryPreviewScene {...props} localTimeSeconds={5} />);
    expect([...container.querySelectorAll<HTMLElement>("[data-collage-card]")]
      .every(({ style }) => style.visibility === "visible")).toBe(true);
  });

  it("hides collage cards until their moving entrance begins", () => {
    const materials = [photo("first"), photo("second")];
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "collage", rendererId: "collage", layoutId: "stack", materials, durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({ layoutId: "stack", materials, straightCards: false, seedKey: "preview" }),
        cardOffsets: createCollageCardOffsets({ layoutId: "stack", materials, direction: defaults.rowDirection, seedKey: "preview" }),
      },
      render: { status: "idle" },
    };
    const props = {
      storyId: "story-1", session, scene, timelineIndex: 0, status: "playing" as const, active: true, pending: false,
      muted: true, reducedMotion: false, retryKey: 0, copy: getEditorCopy("en"),
      onReady: vi.fn(), onWaiting: vi.fn(), onFailed: vi.fn(), onUnexpectedPause: vi.fn(),
    };
    const { container, rerender } = render(<StoryPreviewScene {...props} localTimeSeconds={0} />);
    const initialCards = [...container.querySelectorAll<HTMLElement>("[data-collage-card]")];
    expect(initialCards).toHaveLength(2);
    expect(initialCards.some(({ style }) => style.visibility === "hidden")).toBe(true);

    rerender(<StoryPreviewScene {...props} localTimeSeconds={5} />);
    expect([...container.querySelectorAll<HTMLElement>("[data-collage-card]")]
      .every(({ style }) => style.visibility === "visible")).toBe(true);
  });

  it("includes a custom collage background in the addressable scene readiness protocol", () => {
    const materials = [photo("first"), photo("second")];
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "collage", rendererId: "collage", layoutId: "stack", materials, durationSeconds: 5, motion: "none",
      collageBackground: { source: "material", material: video("background") },
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({ layoutId: "stack", materials, straightCards: false, seedKey: "preview" }),
        cardOffsets: createCollageCardOffsets({ layoutId: "stack", materials, direction: defaults.rowDirection, seedKey: "preview" }),
      },
      render: { status: "idle" },
    };
    const onReady = vi.fn();
    const { container } = render(<StoryPreviewScene
      storyId="story-1"
      session={session}
      scene={scene}
      timelineIndex={2}
      localTimeSeconds={0}
      status="buffering"
      active
      pending
      muted
      reducedMotion={false}
      retryKey={0}
      copy={getEditorCopy("en")}
      onReady={onReady}
      onWaiting={vi.fn()}
      onFailed={vi.fn()}
      onUnexpectedPause={vi.fn()}
    />);

    fireEvent.click(container.querySelector("[data-scene-media='first']")!);
    fireEvent.click(container.querySelector("[data-scene-media='second']")!);
    expect(onReady).not.toHaveBeenCalled();

    const background = container.querySelector("[data-scene-media='background']")!;
    fireEvent.click(background);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenLastCalledWith(2);
  });

  it("keeps a trimmed PPL video card on its final frame instead of looping it", () => {
    const materials = [video("first"), photo("second", "portrait"), photo("third", "landscape")];
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "ppl", rendererId: "collage", layoutId: "2+1", materials, durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({ layoutId: "2+1", materials, straightCards: false, seedKey: "ppl-preview" }),
        cardOffsets: createCollageCardOffsets({
          layoutId: "2+1", materials, direction: defaults.rowDirection, seedKey: "ppl-preview",
        }),
      },
      render: { status: "idle" },
    };
    const { container } = render(<StoryPreviewScene
      storyId="story-1"
      session={session}
      scene={scene}
      timelineIndex={0}
      localTimeSeconds={4}
      status="playing"
      active
      pending={false}
      muted
      reducedMotion={false}
      retryKey={0}
      copy={getEditorCopy("en")}
      onReady={vi.fn()}
      onWaiting={vi.fn()}
      onFailed={vi.fn()}
      onUnexpectedPause={vi.fn()}
    />);

    expect(container.querySelector("[data-collage-card='0'] [data-scene-media='first']")
      ?.getAttribute("data-end-behavior")).toBe("hold");
  });
});

function photo(id: string, orientation: "portrait" | "landscape" = "landscape"): ImageMaterial {
  return {
    id, kind: "image", name: `${id}.jpg`, orientation, storageKey: `${id}.jpg`, mimeType: "image/jpeg",
    sizeBytes: 10, width: orientation === "portrait" ? 935 : 1920, height: orientation === "portrait" ? 1683 : 1080,
  };
}

function video(id: string): VideoMaterial {
  return {
    ...photo(id, "portrait"), kind: "video", mimeType: "video/mp4", hasAudio: false, audioTags: [],
    sourceDurationSeconds: 5,
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0, endSeconds: 3.06 } },
  };
}
