import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createCollageCardAngles, createCollageCardOffsets, defaultCollageSettings, type CollageSettings } from "@storyteller/domain";
import { describe, expect, test, vi } from "vitest";
import type { AuthSession, ImageMaterial, Scene } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { CollageRendererSettings } from "./CollageRendererSettings.js";
import { LayoutRendererSettings } from "./LayoutRendererSettings.js";

const materials: ImageMaterial[] = [photo("first"), photo("second")];
const scene: Scene = {
  id: "scene", rendererId: "collage", materials, durationSeconds: 5, motion: "none",
  collage: collageSettings(materials, "stack"), render: { status: "idle" },
};
const session: AuthSession = {
  csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
  profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" },
};

describe("CollageRendererSettings", () => {
  test("commits frame width, color and shape as collage settings", async () => {
    const onChange = vi.fn();
    render(<CollageRendererSettings
      scene={scene}
      copy={getEditorCopy("en")}
      storyId="story"
      session={session}
      saving={false}
      onChange={onChange}
    />);

    expect(screen.getAllByRole("button", { name: /px$/ })).toHaveLength(4);
    expect(screen.queryByText("Background")).toBeNull();
    expect(screen.queryByRole("slider", { name: /^Width/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "16 px" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ collage: {
      ...editable(scene.collage!), frame: { ...scene.collage!.frame, width: 16 },
    } });

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#aabbcc" } });
    expect(onChange).toHaveBeenLastCalledWith({ collage: {
      ...editable(scene.collage!), frame: { ...scene.collage!.frame, color: "#AABBCC" },
    } });

    await userEvent.click(screen.getByRole("button", { name: "Torn paper frame" }));
    expect(onChange).toHaveBeenLastCalledWith({ collage: {
      ...editable(scene.collage!), frame: { ...scene.collage!.frame, shape: "torn" },
    } });

    expect(screen.queryByRole("slider", { name: /overlap/i })).toBeNull();

    const duration = screen.getByRole("slider", { name: "Duration" });
    fireEvent.change(duration, { target: { value: "7" } });
    fireEvent.pointerUp(duration);
    expect(onChange).toHaveBeenLastCalledWith({ durationSeconds: 7 });

    const appearance = screen.getByRole("slider", { name: /^Appearance/u });
    fireEvent.change(appearance, { target: { value: "3" } });
    fireEvent.pointerUp(appearance);
    expect(onChange).toHaveBeenLastCalledWith({ collage: { ...editable(scene.collage!), entryDurationSeconds: 3 } });
    await userEvent.click(screen.getByRole("checkbox", { name: "Keep cards straight" }));
    expect(onChange).toHaveBeenLastCalledWith({ collage: { ...editable(scene.collage!), straightCards: true } });
    expect(onChange.mock.calls.at(-1)?.[0].collage).not.toHaveProperty("cardAngles");
    expect(screen.queryByRole("slider", { name: /^Hold/u })).toBeNull();
    expect(screen.queryByText("Main photo")).toBeNull();
    expect(screen.queryByText("Photo focus")).toBeNull();
  });

  test("models no frame as an enum value and hides irrelevant width and color controls", async () => {
    const onChange = vi.fn();
    const withoutFrame = {
      ...scene,
      collage: { ...scene.collage!, frame: { ...scene.collage!.frame, shape: "none" as const } },
    };
    const props = {
      copy: getEditorCopy("en"), storyId: "story", session, saving: false, onChange,
    };
    const { rerender } = render(<CollageRendererSettings {...props} scene={withoutFrame} />);

    expect(screen.getAllByRole("button", { name: /frame$/i })).toHaveLength(3);
    expect(screen.queryByRole("group", { name: "Width" })).toBeNull();
    expect(screen.queryByLabelText("Color")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Straight frame" }));
    expect(onChange).toHaveBeenLastCalledWith({ collage: {
      ...editable(withoutFrame.collage), frame: { ...withoutFrame.collage.frame, shape: "straight" },
    } });

    rerender(<CollageRendererSettings {...props} scene={{
      ...withoutFrame,
      collage: { ...withoutFrame.collage, frame: { ...withoutFrame.collage.frame, shape: "straight" } },
    }} />);
    expect(screen.getAllByRole("button", { name: /px$/ }).map((button) => button.textContent)).toEqual([
      "12 px", "16 px", "20 px", "24 px",
    ]);
    expect(screen.getByLabelText("Color")).toBeDefined();
  });

  test("selects the editor associated with each layout family", () => {
    const onChange = vi.fn();
    const common = {
      copy: getEditorCopy("en"), storyId: "story", session, saving: false, onChange,
    };
    const { container, rerender } = render(<LayoutRendererSettings {...common} scene={scene} />);
    expect(container.querySelector("[data-collage-editor='paper-stack']")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "Card alignment" })).toBeNull();

    const rows = [photo("p1", "portrait"), photo("p2", "portrait"), photo("p3", "portrait"), photo("p4", "portrait")];
    rerender(<LayoutRendererSettings {...common} scene={collageScene(rows, "2x2")} />);
    expect(container.querySelector("[data-collage-editor='paper-rows']")).not.toBeNull();
    expect(screen.queryByRole("slider", { name: /overlap/i })).toBeNull();
    expect(screen.queryByText(/20\s*[–-]\s*40/)).toBeNull();
    expect(screen.getAllByRole("group", { name: "Card alignment" })[0]!.querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Level" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "Irregular" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "Ascending" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Irregular" }));
    expect(onChange).toHaveBeenLastCalledWith({
      collage: { ...editable(collageSettings(rows, "2x2")), rowDirection: "random" },
      outcome: { collageRowDirectionConfigured: "random" },
    });

    const cascade = Array.from({ length: 6 }, (_, index) => photo(`c${index}`, "portrait"));
    rerender(<LayoutRendererSettings {...common} scene={collageScene(cascade, "portrait-pairs-descending")} />);
    expect(container.querySelector("[data-collage-editor='paper-cascade']")).not.toBeNull();
    expect(screen.queryByRole("slider", { name: /overlap/i })).toBeNull();
  });

  test("can turn an unsupported full sequence into a collage by reserving the first material for the background", async () => {
    const onChange = vi.fn();
    const { layoutId: _layoutId, ...sceneWithoutLayout } = scene;
    const unsupportedMaterials = [photo("background", "portrait"), photo("left"), photo("right")];
    const unsupported: Scene = {
      ...sceneWithoutLayout,
      materials: unsupportedMaterials,
      collage: {
        ...defaultCollageSettings(unsupportedMaterials),
      },
    };
    render(<LayoutRendererSettings scene={unsupported} copy={getEditorCopy("en")}
      storyId="story" session={session} saving={false} onChange={onChange} />);

    expect(screen.getByRole("slider", { name: "Duration" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /background/i })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function collageScene(collageMaterials: ImageMaterial[], layoutId: string): Scene {
  return {
    ...scene,
    layoutId,
    materials: collageMaterials,
    collage: collageSettings(collageMaterials, layoutId),
  };
}

function collageSettings(collageMaterials: ImageMaterial[], layoutId: string): CollageSettings {
  const settings = defaultCollageSettings(collageMaterials);
  return {
    ...settings,
    cardAngles: createCollageCardAngles({
      layoutId, materials: collageMaterials, straightCards: false, seedKey: "settings-test",
    }),
    cardOffsets: createCollageCardOffsets({
      layoutId, materials: collageMaterials, direction: settings.rowDirection, seedKey: "settings-test",
    }),
  };
}

function editable(settings: CollageSettings) {
  const { cardAngles: _hiddenAngles, cardOffsets: _hiddenOffsets, rowDirection: _hiddenDirection, ...result } = settings;
  return result;
}

function photo(id: string, orientation: "portrait" | "landscape" = "landscape"): ImageMaterial {
  return {
    id, kind: "image", name: `${id}.jpg`, orientation, storageKey: `${id}.jpg`,
    mimeType: "image/jpeg", sizeBytes: 100,
    width: orientation === "portrait" ? 900 : 1600,
    height: orientation === "portrait" ? 1600 : 900,
  };
}
