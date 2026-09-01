import { render } from "@testing-library/react";
import {
  createCollageCardAngles, createCollageCardOffsets, defaultCollageSettings,
} from "@storyteller/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession, ImageMaterial, Scene } from "../../api.js";
import { getEditorCopy } from "../editor/editor-copy.js";
import { StoryPreviewScene } from "./StoryPreviewScene.js";

vi.mock("./PreviewMaterial.js", () => ({ PreviewMaterial: () => <span data-preview-material /> }));

const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;

describe("StoryPreviewScene", () => {
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
});

function photo(id: string): ImageMaterial {
  return {
    id, kind: "image", name: `${id}.jpg`, orientation: "landscape", storageKey: `${id}.jpg`, mimeType: "image/jpeg",
    sizeBytes: 10, width: 1920, height: 1080,
  };
}
