import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ImageMaterial, Scene, SceneMaterial, VideoMaterial } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { MultiImageRendererSelector } from "./MultiImageRendererSelector.js";

describe("MultiImageRendererSelector", () => {
  test("mirrors the single-photo renderer choice with animated collage and disabled AI", () => {
    render(<MultiImageRendererSelector scene={scene([photo("a", "landscape"), photo("b", "landscape")])}
      copy={getEditorCopy("en")} saving={false} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Animated collage" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: /AI animation/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("heading", { name: "Composition" })).toBeNull();
  });

  test("reports an unsupported crop-aware orientation sequence", () => {
    render(<MultiImageRendererSelector scene={scene([
      photo("a", "landscape"), photo("b", "portrait"), photo("c", "landscape"),
    ])} copy={getEditorCopy("en")} saving={false} onChange={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("LPL");
    expect(screen.getByRole("status").textContent).toContain("has been implemented");
    expect(screen.getByRole("status").textContent).toContain("LL, PPL, PPPP, PPLL, PPLPP, PPPPL, PPPPLL, PPPPPP");
  });

  test("keeps the PPL animated collage available when one card is video", () => {
    render(<MultiImageRendererSelector scene={{ ...scene([
      video("video", "portrait"), photo("portrait", "portrait"), photo("landscape", "landscape"),
    ]), layoutId: "2+1" }} copy={getEditorCopy("en")} saving={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Animated collage" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("validates only cards when a custom video is used as the background", () => {
    const materials = [photo("left", "landscape"), photo("right", "landscape")];
    render(<MultiImageRendererSelector scene={{
      ...scene(materials),
      layoutId: "stack",
      collageBackground: { source: "material", material: video("background", "portrait") },
      collage: {
        frame: { width: 12, color: "#FFFFFF", shape: "straight" },
        entryDurationSeconds: 4,
        rowDirection: "ascending",
        straightCards: false,
        cardAngles: [
          { materialId: "left", angleDegrees: -4 },
          { materialId: "right", angleDegrees: 4 },
        ],
        cardOffsets: [{ materialId: "left", offsetY: 0 }, { materialId: "right", offsetY: 0 }],
      },
    }} copy={getEditorCopy("en")} saving={false} onChange={vi.fn()} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Animated collage" }).getAttribute("aria-pressed")).toBe("true");
  });
});

function scene(materials: readonly SceneMaterial[]): Scene {
  return { id: "scene", rendererId: "collage", materials, durationSeconds: 5, motion: "none", render: { status: "idle" } };
}

function video(id: string, orientation: "portrait" | "landscape"): VideoMaterial {
  return {
    ...photo(id, orientation), kind: "video", mimeType: "video/mp4", hasAudio: true, audioTags: ["ambient"],
    sourceDurationSeconds: 8,
  };
}

function photo(id: string, orientation: "portrait" | "landscape"): ImageMaterial {
  return {
    id, kind: "image", name: `${id}.jpg`, orientation, storageKey: `${id}.jpg`, mimeType: "image/jpeg", sizeBytes: 100,
    width: orientation === "portrait" ? 900 : 1600, height: orientation === "portrait" ? 1600 : 900,
  };
}
