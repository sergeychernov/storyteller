import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalizationProvider } from "@storyteller/web-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessProvider } from "../../access-control.js";
import type { AuthSession, EffectiveAccess, Story, StoryExport } from "../../api.js";
import { StoryExportPanel } from "./StoryExportPanel.js";

const api = vi.hoisted(() => ({ getCurrentStoryExport: vi.fn(), requestStoryExport: vi.fn() }));
const track = vi.hoisted(() => vi.fn());
vi.mock("../../api.js", async (original) => ({
  ...await original<typeof import("../../api.js")>(), ...api,
}));
vi.mock("@storyteller/analytics", async (original) => ({
  ...await original<typeof import("@storyteller/analytics")>(), analytics: { track },
}));

describe("StoryExportPanel", () => {
  beforeEach(() => { api.getCurrentStoryExport.mockReset(); api.requestStoryExport.mockReset(); track.mockReset(); });

  it("restores ready progress and exposes a direct download without fetching a Blob", async () => {
    api.getCurrentStoryExport.mockResolvedValue(readyExport);
    renderPanel();
    expect(await screen.findByText("Master is ready at 29.97 FPS.")).toBeTruthy();
    const download = screen.getByRole<HTMLAnchorElement>("link", { name: "Download MP4" });
    expect(download.href).toContain(`/stories/${story.id}/exports/${readyExport.id}/content`);
    download.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(download);
    expect(track).toHaveBeenCalledWith("story exported", { output_profile: "vertical_social" });
    expect(api.requestStoryExport).not.toHaveBeenCalled();
  });

  it("starts a master and replaces idle state with frame-weighted progress", async () => {
    api.getCurrentStoryExport.mockResolvedValue(null);
    api.requestStoryExport.mockResolvedValue({ ...readyExport, status: "rendering", progressPercent: 42, readySegments: 1 });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Build master" }));
    await waitFor(() => expect(screen.getByText("42%")).toBeTruthy());
    expect(screen.getByText("Rendering scenes: 1 of 2 ready.")).toBeTruthy();
    expect(api.requestStoryExport).toHaveBeenCalledWith(session.csrfToken, story.id, story.revision);
  });
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><LocalizationProvider><AccessProvider access={access}>
    <StoryExportPanel story={story} session={session} />
  </AccessProvider></LocalizationProvider></QueryClientProvider>);
}

const session = {
  csrfToken: "csrf", profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;
const story: Story = {
  id: "00000000-0000-4000-8000-000000000001", profileId: session.profile.id, title: "Trip", status: "draft", revision: 7,
  scenes: [], narrations: [], music: { generationStatus: "idle", applied: false },
};
const readyExport: StoryExport = {
  id: "00000000-0000-4000-8000-000000000002", status: "ready", currentRevision: 7, storyRevision: 7,
  outputProfileId: "vertical-social-v1", frameRate: { numerator: 30_000, denominator: 1_001 }, totalFrames: 300,
  progressPercent: 100, progressPhase: "ready", readySegments: 2, totalSegments: 2, sizeBytes: 1_024,
};
const access: EffectiveAccess = {
  planVersionCode: null, roles: [], capabilities: [{ code: "story.export", allowed: true, sources: [] }],
  limits: [], evaluatedAt: "2026-09-02T00:00:00.000Z",
};
