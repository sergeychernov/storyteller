import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocalizationProvider } from "@storyteller/web-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessProvider } from "../../access-control.js";
import type { AuthSession, EffectiveAccess, SoundtrackRender, Story, StoryExport, StoryTimeline } from "../../api.js";
import { StoryPreview } from "./StoryPreview.js";

const api = vi.hoisted(() => ({
  getCurrentStoryExport: vi.fn(), requestStoryExport: vi.fn(),
  getCurrentSoundtrack: vi.fn(), listSoundtrackPresets: vi.fn(), requestSoundtrack: vi.fn(),
  setStorySoundtrackMix: vi.fn(),
}));
vi.mock("../../api.js", async (original) => ({ ...await original<typeof import("../../api.js")>(), ...api }));
vi.mock("@storyteller/analytics", async (original) => ({
  ...await original<typeof import("@storyteller/analytics")>(), analytics: { track: vi.fn() },
}));

describe("the master reacts to the story audio without a reload", () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    localStorage.clear();
    api.getCurrentStoryExport.mockResolvedValue(readyExport);
    api.getCurrentSoundtrack.mockResolvedValue(readySoundtrack);
    api.listSoundtrackPresets.mockResolvedValue([{ id: "road", version: 1, bpm: 96, default: true }]);
    api.setStorySoundtrackMix.mockImplementation((_token, _storyId, _revision, mix) =>
      Promise.resolve({ ...story, soundtrackMix: mix }));
  });

  it("drops the download once a level is saved", async () => {
    renderPreview();
    expect(await screen.findByRole("link", { name: "Download MP4" })).toBeTruthy();

    api.getCurrentStoryExport.mockResolvedValue({ ...readyExport, current: false });
    fireEvent.change(screen.getByRole("slider", { name: "Rhythm" }), { target: { value: "40" } });

    await waitFor(() => expect(api.setStorySoundtrackMix).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Download MP4" })).toBeNull(), { timeout: 3_000 });
    expect(screen.getByRole("button", { name: "Build again" })).toBeTruthy();
  });
});

function renderPreview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter initialEntries={["/story-1/preview"]}>
    <QueryClientProvider client={client}><LocalizationProvider><AccessProvider access={access}>
      <StoryPreview story={story} timeline={timeline} session={session} />
    </AccessProvider></LocalizationProvider></QueryClientProvider>
  </MemoryRouter>);
}

const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;
const story: Story = {
  id: "00000000-0000-4000-8000-000000000001", profileId: session.profile.id, title: "Trip", status: "draft", revision: 7,
  scenes: [], narrations: [], music: { generationStatus: "idle", applied: false },
};
const timeline: StoryTimeline = {
  storyId: story.id, revision: story.revision, sceneOrder: [], scenes: [],
  frameRate: { numerator: 30, denominator: 1 }, totalFrames: 300, totalDurationSeconds: 10,
  transitionOverlapSeconds: 0, warnings: [], formatLimits: [],
};
const readyExport: StoryExport = {
  id: "00000000-0000-4000-8000-000000000002", current: true, status: "ready", currentRevision: 7, storyRevision: 7,
  outputProfileId: "vertical-social-v1", frameRate: timeline.frameRate, totalFrames: 300,
  progressPercent: 100, progressPhase: "ready", readySegments: 1, totalSegments: 1, sizeBytes: 1_024,
};
const readySoundtrack: SoundtrackRender = {
  id: "00000000-0000-4000-8000-000000000003", status: "ready", progressPercent: 100, progressPhase: "ready",
  current: true, currentRevision: 7, storyRevision: 7, inputHash: "a".repeat(64),
  preset: { id: "road", version: 1, bpm: 96, default: true },
  frameRate: timeline.frameRate, totalFrames: 300, totalSampleFrames: 480_000,
  stems: ["rhythm", "melody"], melodyVariant: 0, createdAt: "2026-09-05T00:00:00.000Z",
};
const access: EffectiveAccess = {
  planVersionCode: null, roles: [],
  capabilities: [{ code: "story.export", allowed: true, sources: [] }, { code: "story.soundtrack.generate", allowed: true, sources: [] }],
  limits: [], evaluatedAt: "2026-09-05T00:00:00.000Z",
};
