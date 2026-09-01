import { act, render } from "@testing-library/react";
import {
  collageCardMaterials, collageLayoutDefinitions, collageLayoutMaterials, createCollageCardAngles, createCollageCardOffsets,
  defaultCollageSettings,
} from "@storyteller/domain";
import { describe, expect, test, vi } from "vitest";
import { createRef } from "react";
import type { AuthSession, ImageMaterial, Scene, VideoMaterial } from "../../api.js";
import { CollageRendererPreview } from "./CollageRendererPreview.js";
import { getEditorCopy } from "./editor-copy.js";
import { SceneRendererPreview } from "./SceneRenderer.js";
import type { ScenePreviewLifecycle } from "./scene-preview-lifecycle.js";
import { StillImageRendererPreview } from "./StillImageRendererPreview.js";

vi.mock("./MaterialThumbnail.js", () => ({ MaterialThumbnail: () => <span /> }));
vi.mock("./CollageVideo.js", () => ({
  CollageVideo: ({ loop = false, material }: { loop?: boolean; material: VideoMaterial }) =>
    <video data-collage-video={material.id} data-loop={String(loop)} />,
}));

describe("CollageRendererPreview", () => {
  test("plays the entrance and computed final hold once per initialized scene", () => {
    const materials = [photo("first"), photo("second")];
    const defaults = defaultCollageSettings(materials);
    const cardAngles = createCollageCardAngles({
      layoutId: "stack", materials, straightCards: false, seedKey: "preview-test",
    });
    const cardOffsets = createCollageCardOffsets({
      layoutId: "stack", materials, direction: defaults.rowDirection, seedKey: "preview-test",
    });
    const scene: Scene = {
      id: "scene", rendererId: "collage", layoutId: "stack", materials, durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        frame: { ...defaults.frame, shape: "torn" },
        cardAngles,
        cardOffsets,
      },
      render: { status: "idle" },
    };
    const { container } = render(<CollageRendererPreview
      scene={scene}
      copy={getEditorCopy("en")}
      storyId="story"
      session={session}
      active
      saving={false}
    />);

    const cards = [...container.querySelectorAll<HTMLElement>("[data-collage-card]")];
    const schedule = createCollageSchedule(scene);
    expect(cards).toHaveLength(2);
    cards.forEach((card, index) => {
      expect(card.style.animationDuration).toBe("5s");
      expect(card.style.animationIterationCount).toBe("1");
      expect(card.style.animationName).toMatch(/^collage-preview-scene-/u);
      expect(card.style.filter).toContain("drop-shadow");
      expect(card.style.height).toBe("auto");
      expect(card.style.aspectRatio).not.toBe("");
      const shape = card.querySelector<HTMLElement>("[data-collage-card-shape='torn']");
      const content = card.querySelector<HTMLElement>("[data-collage-card-content]");
      const innerEdge = card.querySelector<SVGElement>("[data-collage-card-inner-edge='torn']");
      expect(shape?.style.clipPath).toMatch(/^polygon\(/u);
      expect(content?.style.clipPath).toBe("");
      expect(innerEdge?.querySelector("path")?.getAttribute("d")).toMatch(/^M0 0H/u);
      expect(shape?.style.filter).toBe("");
      expect(card.style.transform).toBe(`rotate(${cardAngles[index]!.angleDegrees}deg)`);
      expect(card.style.zIndex).toBe(String(index + 1));
      expect(card.style.getPropertyValue("--enter-x")).toBe(`${schedule[index]!.startOffsetX / schedule[index]!.width * 100}%`);
      expect(card.style.getPropertyValue("--enter-y")).toBe(`${schedule[index]!.startOffsetY / schedule[index]!.height * 100}%`);
    });
    const keyframes = container.querySelector("style")?.textContent ?? "";
    cardAngles.forEach(({ angleDegrees }) => {
      expect(keyframes).toContain(`rotate(${angleDegrees}deg)}100%{transform:translate(0,0) rotate(${angleDegrees}deg)}`);
    });
  });

  test("opens a two-plus-one preview when the final card has a square crop and a persisted angle", () => {
    const square = {
      ...photo("square", "landscape"),
      edit: {
        rotation: 0 as const,
        crop: { x: 0.21875, y: 0, width: 0.5625, height: 1 },
        result: {
          storageKey: "square-edited.jpg", mimeType: "image/jpeg", sizeBytes: 80,
          width: 900, height: 900, orientation: "landscape" as const,
        },
      },
    };
    const materials = [photo("left", "portrait"), photo("right", "portrait"), square];
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "square-crop", rendererId: "collage", layoutId: "2+1", materials,
      durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        cardAngles: [
          { materialId: "left", angleDegrees: -4 },
          { materialId: "right", angleDegrees: 4 },
          { materialId: "square", angleDegrees: 5.4208 },
        ],
        cardOffsets: createCollageCardOffsets({
          layoutId: "2+1", materials, direction: defaults.rowDirection, seedKey: "square-crop-preview",
        }),
      },
      render: { status: "idle" },
    };

    const { container } = render(<CollageRendererPreview scene={scene} copy={getEditorCopy("en")}
      storyId="story" session={session} active saving={false} />);
    const schedule = createCollageSchedule(scene);

    expect(container.querySelectorAll("[data-collage-card]")).toHaveLength(3);
    expect(schedule[2]!.width).toBe(schedule[2]!.height);
    expect(schedule[2]!.width).toBeLessThan(994);
  });

  test("reinitializes its entire subtree through the preview lifecycle", () => {
    const materials = [photo("first"), photo("second")];
    const scene = collageScene(materials, 5);
    const lifecycle = createRef<ScenePreviewLifecycle>();
    const { container } = render(<CollageRendererPreview ref={lifecycle} scene={scene} copy={getEditorCopy("en")}
      storyId="story" session={session} active saving={false} />);
    const firstCard = container.querySelector("[data-collage-card='0']");

    act(() => lifecycle.current?.initializeScene());

    expect(container.querySelector("[data-collage-card='0']")).not.toBe(firstCard);
  });

  test("common scene preview initializes the renderer at every scene boundary", () => {
    vi.useFakeTimers();
    try {
      const materials = [photo("first"), photo("second")];
      const scene = collageScene(materials, 5);
      const { container } = render(<SceneRendererPreview scene={scene} copy={getEditorCopy("en")}
        storyId="story" session={session} active saving={false} />);
      const firstCard = container.querySelector("[data-collage-card='0']");

      act(() => vi.advanceTimersByTime(5_000));

      expect(container.querySelector("[data-collage-card='0']")).not.toBe(firstCard);
    } finally {
      vi.useRealTimers();
    }
  });

  test("still-image preview implements the same initialization lifecycle", () => {
    const lifecycle = createRef<ScenePreviewLifecycle>();
    const scene: Scene = {
      id: "still-lifecycle", rendererId: "still-image", materials: [photo("single")],
      durationSeconds: 5, motion: "none", render: { status: "idle" },
    };
    const { container } = render(<StillImageRendererPreview ref={lifecycle} scene={scene} copy={getEditorCopy("en")}
      storyId="story" session={session} active saving={false} />);
    const firstMaterial = container.querySelector("span");

    act(() => lifecycle.current?.initializeScene());

    expect(container.querySelector("span")).not.toBe(firstMaterial);
  });

  test("paints cards by appearance order when a layout enters from bottom to top", () => {
    const materials = Array.from({ length: 6 }, (_, index) => photo(`portrait-${index}`, "portrait"));
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "ascending", rendererId: "collage", layoutId: "portrait-pairs-ascending",
      materials, durationSeconds: 6, motion: "none",
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({
          layoutId: "portrait-pairs-ascending", materials, straightCards: false, seedKey: "preview-layer-test",
        }),
        cardOffsets: createCollageCardOffsets({
          layoutId: "portrait-pairs-ascending", materials, direction: defaults.rowDirection, seedKey: "preview-layer-test",
        }),
      },
      render: { status: "idle" },
    };
    const { container } = render(<CollageRendererPreview
      scene={scene}
      copy={getEditorCopy("en")}
      storyId="story"
      session={session}
      active
      saving={false}
    />);

    expect([...container.querySelectorAll<HTMLElement>("[data-collage-card]")].map(({ style }) => style.zIndex))
      .toEqual(["5", "6", "3", "4", "1", "2"]);
  });

  test("applies the persisted random row distance for ascending and descending compositions", () => {
    const materials = Array.from({ length: 4 }, (_, index) => photo(`portrait-${index}`, "portrait"));
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "row-rhythm", rendererId: "collage", layoutId: "2x2", materials, durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        straightCards: true,
        cardAngles: materials.map(({ id }) => ({ materialId: id, angleDegrees: 0 })),
        cardOffsets: createCollageCardOffsets({
          layoutId: "2x2", materials, direction: "ascending", seedKey: "row-rhythm",
        }),
      },
      render: { status: "idle" },
    };
    const props = { copy: getEditorCopy("en"), storyId: "story", session, active: true, saving: false };
    const { container, rerender } = render(<CollageRendererPreview scene={scene} {...props} />);
    const cardTop = (index: number) => Number.parseFloat(
      container.querySelector<HTMLElement>(`[data-collage-card='${index}']`)!.style.top,
    ) * 19.2;
    const rise = cardTop(0) - cardTop(1);
    expect(rise).toBeGreaterThanOrEqual(20);
    expect(rise).toBeLessThanOrEqual(40);

    rerender(<CollageRendererPreview scene={{
      ...scene, collage: {
        ...scene.collage!, rowDirection: "descending",
        cardOffsets: createCollageCardOffsets({
          layoutId: "2x2", materials, direction: "descending", seedKey: "row-rhythm",
        }),
      },
    }} {...props} />);
    const fall = cardTop(0) - cardTop(1);
    expect(fall).toBeLessThanOrEqual(-20);
    expect(fall).toBeGreaterThanOrEqual(-40);
  });

  test("renders video as moving media inside the shared card for any matching layout", () => {
    const materials = [video("first", "landscape"), photo("second", "landscape")];
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "mixed", rendererId: "collage", layoutId: "stack", materials, durationSeconds: 5, motion: "none",
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({
          layoutId: "stack", materials, straightCards: false, seedKey: "mixed-preview-test",
        }),
        cardOffsets: createCollageCardOffsets({
          layoutId: "stack", materials, direction: defaults.rowDirection, seedKey: "mixed-preview-test",
        }),
      },
      render: { status: "idle" },
    };
    const { container } = render(<CollageRendererPreview scene={scene} copy={getEditorCopy("en")}
      storyId="story" session={session} active saving={false} />);

    const videoElement = container.querySelector("[data-collage-video='first']");
    expect(videoElement).not.toBeNull();
    expect(videoElement?.getAttribute("data-loop")).toBe("false");
    expect(videoElement?.closest("[data-collage-card='0']")).not.toBeNull();
    expect(container.querySelectorAll("[data-collage-card]")).toHaveLength(2);
  });

  test("renders a custom video only as the original background", () => {
    const background = video("background", "portrait");
    const cards = [photo("left", "landscape"), photo("right", "landscape")];
    const materials = cards;
    const defaults = defaultCollageSettings(materials);
    const scene: Scene = {
      id: "video-background", rendererId: "collage", layoutId: "stack", materials, durationSeconds: 5, motion: "none",
      collageBackground: { source: "material", material: background },
      collage: {
        ...defaults,
        cardAngles: createCollageCardAngles({
          layoutId: "stack", materials: cards, straightCards: false, seedKey: "background-preview-test",
        }),
        cardOffsets: createCollageCardOffsets({
          layoutId: "stack", materials: cards, direction: defaults.rowDirection, seedKey: "background-preview-test",
        }),
      },
      render: { status: "idle" },
    };
    const { container } = render(<CollageRendererPreview scene={scene} copy={getEditorCopy("en")}
      storyId="story" session={session} active saving={false} />);

    expect(container.querySelector("[data-collage-video='background']")?.closest("[data-collage-background-mode='custom-material']"))
      .not.toBeNull();
    expect(container.querySelector("[data-collage-video='background']")?.closest("[data-collage-card]")).toBeNull();
    expect(container.querySelectorAll("[data-collage-card]")).toHaveLength(2);
  });
});

const session: AuthSession = {
  csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
  profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" },
};

function photo(id: string, orientation: "portrait" | "landscape" = "landscape"): ImageMaterial {
  return {
    id, kind: "image", name: `${id}.jpg`, orientation, storageKey: `${id}.jpg`,
    mimeType: "image/jpeg", sizeBytes: 100,
    width: orientation === "portrait" ? 900 : 1600,
    height: orientation === "portrait" ? 1600 : 900,
  };
}

function video(id: string, orientation: "portrait" | "landscape" = "portrait"): VideoMaterial {
  return {
    ...photo(id, orientation), kind: "video", mimeType: "video/mp4", hasAudio: true, audioTags: ["ambient"],
    sourceDurationSeconds: 8,
  };
}

function collageScene(materials: readonly ImageMaterial[], durationSeconds: number): Scene {
  const defaults = defaultCollageSettings(materials);
  return {
    id: "lifecycle", rendererId: "collage", layoutId: "stack", materials, durationSeconds, motion: "none",
    collage: {
      ...defaults,
      cardAngles: createCollageCardAngles({
        layoutId: "stack", materials, straightCards: false, seedKey: "preview-lifecycle-test",
      }),
      cardOffsets: createCollageCardOffsets({
        layoutId: "stack", materials, direction: defaults.rowDirection, seedKey: "preview-lifecycle-test",
      }),
    },
    render: { status: "idle" },
  };
}

function createCollageSchedule(scene: Scene) {
  const layout = collageLayoutDefinitions.find(({ id }) => id === scene.layoutId)!;
  const materials = collageCardMaterials(scene.materials, scene.collage!);
  return layout.renderer.createSchedule({
    materials: collageLayoutMaterials(materials),
    width: 1080,
    height: 1920,
    settings: scene.collage!,
  });
}
