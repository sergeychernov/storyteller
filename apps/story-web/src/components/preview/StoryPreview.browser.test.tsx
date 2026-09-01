import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocalizationProvider } from "@storyteller/web-ui";
import { describe, expect, it } from "vitest";
import type { AuthSession, Story, StoryTimeline } from "../../api.js";
import { StoryPreview } from "./StoryPreview.js";

const story: Story = {
  id: "story-1", profileId: "profile-1", title: "Travel diary", status: "draft", revision: 1,
  scenes: [
    { id: "scene-1", title: "Opening", materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" } },
    { id: "scene-2", title: "Second", materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" } },
  ],
  narrations: [], music: { generationStatus: "idle", applied: false },
};
const timeline: StoryTimeline = {
  storyId: story.id, revision: story.revision, sceneOrder: ["scene-1", "scene-2"],
  scenes: [
    { sceneId: "scene-1", index: 0, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, durationSource: "empty" },
    { sceneId: "scene-2", index: 1, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, durationSource: "empty" },
  ],
  totalDurationSeconds: 0, transitionOverlapSeconds: 0,
  warnings: [{ code: "empty_scene", sceneId: "scene-1" }, { code: "empty_scene", sceneId: "scene-2" }], formatLimits: [],
};
const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;

function renderPreview(entry: string | { pathname: string; state: { returnTo: string } }) {
  return render(<MemoryRouter initialEntries={[entry]}>
    <LocalizationProvider><StoryPreview story={story} timeline={timeline} session={session} /></LocalizationProvider>
  </MemoryRouter>);
}

describe("StoryPreview", () => {
  it("returns a direct preview entry to the first available scene", () => {
    renderPreview("/story-1/preview");
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: /Back to editor/ }).getAttribute("href")).toBe("/story-1/scenes/scene-1");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Play" }).disabled).toBe(true);
    expect(screen.getByText("Empty scenes: 2")).toBeTruthy();
  });

  it("preserves the scene selected before preview", () => {
    renderPreview({ pathname: "/story-1/preview", state: { returnTo: "/story-1/scenes/scene-2" } });
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: /Back to editor/ }).getAttribute("href")).toBe("/story-1/scenes/scene-2");
  });

  it.each([
    ["en", /Back to editor/],
    ["ru", /В редактор/],
    ["sr-Latn", /Nazad u uređivač/],
    ["es", /Volver al editor/],
  ] as const)("renders preview controls in %s", (locale, backLabel) => {
    localStorage.setItem("storyteller.locale", locale);
    renderPreview("/story-1/preview");
    expect(screen.getByRole("link", { name: backLabel })).toBeTruthy();
  });
});
