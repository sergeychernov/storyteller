import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Scene } from "../../api.js";
import { DesktopEditorHeader } from "./DesktopEditorHeader.js";
import { getEditorCopy } from "./editor-copy.js";
import { SceneEditorHeader } from "./SceneEditorHeader.js";

const scene: Scene = {
  id: "scene-2", materials: [], durationSeconds: 0, motion: "none", render: { status: "idle" },
};

describe("story preview editor entry", () => {
  it("links desktop preview to the current story and selected scene", () => {
    render(<MemoryRouter><DesktopEditorHeader storyId="story-1" storyTitle="Story" scenes={[scene]} selected={scene}
      copy={getEditorCopy("en")} saving={false} compact={false} /></MemoryRouter>);
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: /Preview/ }).getAttribute("href")).toBe("/story-1/preview");
  });

  it("removes desktop and mobile navigation while a save is unconfirmed", () => {
    const { rerender } = render(<MemoryRouter><DesktopEditorHeader storyId="story-1" storyTitle="Story" scenes={[scene]} selected={scene}
      copy={getEditorCopy("en")} saving compact={false} /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: /Preview/ })).toBeNull();
    expect(screen.getByText(/Preview/).getAttribute("aria-disabled")).toBe("true");

    rerender(<MemoryRouter><SceneEditorHeader storyId="story-1" storyTitle="Story" scenes={[scene]} selectedId={scene.id}
      copy={getEditorCopy("en")} saving mode="scene" onModeChange={() => undefined} /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Preview" })).toBeNull();
    expect(screen.getByText("▶").getAttribute("aria-disabled")).toBe("true");
  });
});
