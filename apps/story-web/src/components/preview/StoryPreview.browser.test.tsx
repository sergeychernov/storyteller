import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LocalizationProvider } from "@storyteller/web-ui";
import { describe, expect, it } from "vitest";
import type { AuthSession, Story, StoryTimeline } from "../../api.js";
import { StoryPreview } from "./StoryPreview.js";
import { AccessProvider } from "../../access-control.js";
import type { EffectiveAccess } from "../../api.js";

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
    { sceneId: "scene-1", index: 0, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, startFrame: 0, endFrame: 0, durationFrames: 0, durationSource: "empty" },
    { sceneId: "scene-2", index: 1, materialIds: [], startSeconds: 0, endSeconds: 0, durationSeconds: 0, startFrame: 0, endFrame: 0, durationFrames: 0, durationSource: "empty" },
  ],
  frameRate: { numerator: 30, denominator: 1 }, totalFrames: 0, totalDurationSeconds: 0, transitionOverlapSeconds: 0,
  warnings: [{ code: "empty_scene", sceneId: "scene-1" }, { code: "empty_scene", sceneId: "scene-2" }], formatLimits: [],
};
const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;

function renderPreview(entry: string | { pathname: string; state: { returnTo: string } }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter initialEntries={[entry]}>
    <QueryClientProvider client={queryClient}><LocalizationProvider><AccessProvider access={access}>
      <StoryPreview story={story} timeline={timeline} session={session} />
    </AccessProvider></LocalizationProvider></QueryClientProvider>
  </MemoryRouter>);
}

const access: EffectiveAccess = {
  planVersionCode: null, roles: [], capabilities: [{ code: "story.export", allowed: false, sources: [] }],
  limits: [], evaluatedAt: "2026-09-02T00:00:00.000Z",
};

describe("StoryPreview", () => {
  it("returns a direct preview entry to the first available scene", () => {
    renderPreview("/story-1/preview");
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: /Back to editor/ }).getAttribute("href")).toBe("/story-1/scenes/scene-1");
    const play = screen.getByRole<HTMLButtonElement>("button", { name: "Play" });
    expect(play.disabled).toBe(true);
    expect(play.textContent).toBe("");
    expect(play.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    const sound = screen.getByRole<HTMLButtonElement>("button", { name: "Sound on" });
    expect(sound.textContent).toBe("");
    expect(sound.querySelector("svg")).not.toBeNull();
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
