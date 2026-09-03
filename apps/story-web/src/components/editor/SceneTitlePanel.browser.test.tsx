import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { AuthSession, Scene, SceneTitle } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { SceneEditorTabs } from "./SceneEditorTabs.js";
import { SceneTitlePanel } from "./SceneTitlePanel.js";
import type { SceneTitleEditorController } from "./use-scene-title-editor.js";

describe("scene title controls", () => {
  test("uses one mobile toggle for adding or removing a title", () => {
    const copy = getEditorCopy("en");
    const scene = imageScene();
    const { rerender } = render(<SceneTitlePanel scene={scene} copy={copy} editor={controller()} variant="mobile" />);
    expect(screen.getAllByRole("button", { name: `＋ ${copy.addTitle}` })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: `− ${copy.removeTitle}` })).toBeNull();

    const savedTitle = title();
    rerender(<SceneTitlePanel scene={{ ...scene, title: savedTitle }} copy={copy}
      editor={controller(savedTitle)} variant="mobile" />);
    expect(screen.queryByRole("button", { name: `＋ ${copy.addTitle}` })).toBeNull();
    expect(screen.getAllByRole("button", { name: `− ${copy.removeTitle}` })).toHaveLength(1);
    expect(screen.getByRole("textbox").getAttribute("maxlength")).toBe("120");
    expect(screen.getByRole("textbox").getAttribute("rows")).toBe("3");
    for (const label of [copy.titleStylePlain, copy.titleStyleShadow, copy.titleStylePlate]) {
      const styleButton = screen.getByRole("button", { name: label });
      expect(styleButton.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(styleButton.getAttribute("title")).toBe(label);
    }
  });

  test("exposes Titles as the third mobile scene tab", () => {
    const copy = getEditorCopy("en");
    const scene = imageScene();
    render(<SceneEditorTabs
      scene={scene}
      copy={copy}
      saving={false}
      uploading={false}
      backgroundUploading={false}
      uploadCount={0}
      storyId="story"
      session={session}
      onUpload={vi.fn()}
      onUploadBackground={vi.fn()}
      onRemoveBackground={vi.fn()}
      onDeleteMaterial={vi.fn()}
      onMoveMaterial={vi.fn()}
      onEditMaterial={vi.fn().mockResolvedValue(undefined)}
      onReorder={vi.fn()}
      onChange={vi.fn()}
      activeTab="titles"
      onActiveTabChange={vi.fn()}
      titleEditor={controller()}
    />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      `${copy.materials} · 1`, copy.layout, `${copy.titles} · 0`,
    ]);
  });

  test("disables title creation for an empty scene", () => {
    const copy = getEditorCopy("en");
    render(<SceneTitlePanel scene={{ ...imageScene(), materials: [] }} copy={copy}
      editor={{ ...controller(), canAdd: false }} variant="desktop" />);
    expect((screen.getByRole("button", { name: `＋ ${copy.addTitle}` }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const session: AuthSession = {
  csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
  profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" },
};

function imageScene(): Scene {
  return {
    id: "scene", rendererId: "still-image", materials: [{
      id: "image", kind: "image", name: "image.jpg", orientation: "portrait", storageKey: "image.jpg",
      mimeType: "image/jpeg", sizeBytes: 100, width: 1080, height: 1920,
    }], durationSeconds: 5, motion: "none", render: { status: "idle" },
  };
}

function title(): SceneTitle {
  return {
    text: "Title", position: { x: 0.5, y: 0.78 }, style: "shadow", size: "medium", color: "#FFFFFF",
    timing: { startSeconds: 0, endSeconds: 5 },
  };
}

function controller(value?: SceneTitle): SceneTitleEditorController {
  return {
    title: value, canAdd: true, saving: false, add: vi.fn(), remove: vi.fn().mockResolvedValue(undefined),
    preview: vi.fn(), save: vi.fn().mockResolvedValue(undefined), saveText: vi.fn().mockResolvedValue(undefined),
  };
}
