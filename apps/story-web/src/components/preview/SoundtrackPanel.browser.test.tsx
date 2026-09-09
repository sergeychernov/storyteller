import type { SoundtrackMix } from "@storyteller/domain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { LocalizationProvider } from "@storyteller/web-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessProvider } from "../../access-control.js";
import type { AuthSession, EffectiveAccess, SoundtrackRender, Story, StoryTimeline } from "../../api.js";
import { SoundtrackPanel, type SoundtrackPanelHandle } from "./SoundtrackPanel.js";
import type { StoryPreviewSnapshot } from "./use-story-preview-controller.js";

const api = vi.hoisted(() => ({ getCurrentSoundtrack: vi.fn(), listSoundtrackPresets: vi.fn(), requestSoundtrack: vi.fn() }));
const track = vi.hoisted(() => vi.fn());
vi.mock("../../api.js", async (original) => ({ ...await original<typeof import("../../api.js")>(), ...api }));
vi.mock("@storyteller/analytics", async (original) => ({
  ...await original<typeof import("@storyteller/analytics")>(), analytics: { track },
}));

describe("SoundtrackPanel", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    fetched.length = 0;
    api.getCurrentSoundtrack.mockReset(); api.listSoundtrackPresets.mockReset(); api.requestSoundtrack.mockReset(); track.mockReset();
    api.getCurrentSoundtrack.mockResolvedValue(null);
    api.listSoundtrackPresets.mockResolvedValue(presets);
  });

  it("selects Road by default and creates the soundtrack with one button", async () => {
    api.requestSoundtrack.mockResolvedValue({ ...ready, status: "running", progressPercent: 35, progressPhase: "synthesizing" });
    renderPanel();
    const road = await screen.findByRole<HTMLInputElement>("radio", { name: "Road" });
    expect(road.checked).toBe(true);
    expect(screen.queryByText(/BPM/)).toBeNull();
    expect(screen.getAllByRole("radio").map((tile) => tile.getAttribute("value"))).toEqual(["road", "lounge", "dnb"]);
    expect(screen.queryByRole("button", { name: "Another melody" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create music" }));
    await waitFor(() => expect(api.requestSoundtrack).toHaveBeenCalledWith(session.csrfToken, story.id, story.revision, "road", 0));
    expect(screen.getByText("35%")).toBeTruthy();
  });

  it("turns the same button into another melody and restarts at zero for a new style", async () => {
    api.getCurrentSoundtrack.mockResolvedValue({ ...ready, melodyVariant: 2 });
    api.requestSoundtrack.mockResolvedValue({ ...ready, melodyVariant: 3 });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Another melody" }));
    await waitFor(() => expect(api.requestSoundtrack)
      .toHaveBeenCalledWith(session.csrfToken, story.id, story.revision, "road", 3));

    fireEvent.click(screen.getByRole("radio", { name: "Lounge" }));
    fireEvent.click(screen.getByRole("button", { name: "Another melody" }));
    await waitFor(() => expect(api.requestSoundtrack)
      .toHaveBeenCalledWith(session.csrfToken, story.id, story.revision, "lounge", 0));
  });

  it("shows one vertical fader per channel and reports every move", async () => {
    api.getCurrentSoundtrack.mockResolvedValue(ready);
    const onMixChange = vi.fn();
    renderPanel({ onMixChange });
    const faders = await screen.findAllByRole("slider");
    expect(faders.map((fader) => fader.getAttribute("aria-label"))).toEqual(["Video", "Rhythm", "Melody", "Ducked"]);
    expect(faders.every((fader) => fader.getAttribute("aria-orientation") === "vertical")).toBe(true);
    expect(faders.map((fader) => (fader as HTMLInputElement).value)).toEqual(["100", "100", "100", "30"]);
    fireEvent.change(faders[2]!, { target: { value: "40" } });
    expect(onMixChange).toHaveBeenCalledWith("melody", 0.4);
  });

  it("offers the download by name and the provenance as an icon", async () => {
    api.getCurrentSoundtrack.mockResolvedValue(ready);
    renderPanel();
    expect((await screen.findByRole("link", { name: "Download M4A" })).getAttribute("href")).toContain("download=true");
    const provenance = screen.getByRole("link", { name: "Provenance" });
    expect(provenance.getAttribute("href")).toContain("/provenance");
    expect(provenance.textContent).toBe("{}Provenance");
    expect(provenance.getAttribute("title")).toBe("Provenance");
  });

  it("keeps the soundtrack faders inert until a soundtrack exists", async () => {
    renderPanel();
    const faders = await screen.findAllByRole<HTMLInputElement>("slider");
    expect(faders.map((fader) => fader.disabled)).toEqual([false, true, true, true]);
  });

  it("starts the stems with the video transport and ducks the melody under source audio", async () => {
    const context = installAudioContext();
    api.getCurrentSoundtrack.mockResolvedValue(ready);
    const handle = createRef<SoundtrackPanelHandle>();
    const view = renderPanel({ handle });
    await screen.findByText(/Ready\./);

    handle.current!.prepareFromGesture();
    await waitFor(() => expect(context.gains.length).toBe(2));
    expect(fetched).toEqual([expect.stringContaining("stem=rhythm"), expect.stringContaining("stem=melody")]);

    view.rerender(panel({ snapshot: { ...pausedSnapshot, status: "playing", playheadSeconds: 4 }, handle }));
    await waitFor(() => expect(context.started).toEqual([4, 4]));

    view.rerender(panel({ snapshot: { ...pausedSnapshot, status: "playing", playheadSeconds: 4 }, sourceAudible: true, handle }));
    await waitFor(() => expect(context.gains[1]!.gain.value).toBeCloseTo(0.3));

    view.rerender(panel({ snapshot: { ...pausedSnapshot, playheadSeconds: 4 }, handle }));
    await waitFor(() => expect(context.stopped).toBe(2));
  });

  it("prepares silently, pauses music during buffering and resumes at the shared position", async () => {
    const context = installAudioContext();
    api.getCurrentSoundtrack.mockResolvedValue(ready);
    const handle = createRef<SoundtrackPanelHandle>();
    const onPlaybackStatus = vi.fn();
    const waiting = { ...pausedSnapshot, status: "buffering" as const };
    const view = renderPanel({ handle, snapshot: waiting, onPlaybackStatus });
    await screen.findByText(/Ready\./);
    handle.current!.prepareFromGesture();
    await waitFor(() => expect(onPlaybackStatus).toHaveBeenLastCalledWith("ready"));
    expect(context.started).toEqual([]);
    view.rerender(panel({ handle, snapshot: { ...waiting, status: "playing", playheadSeconds: 2 } }));
    await waitFor(() => expect(context.started).toEqual([2, 2]));
    view.rerender(panel({ handle, snapshot: { ...waiting, playheadSeconds: 3 } }));
    await waitFor(() => expect(context.stopped).toBe(2));
    view.rerender(panel({ handle, snapshot: { ...waiting, status: "paused", playheadSeconds: 5 } }));
    expect(context.started).toEqual([2, 2]);
    view.rerender(panel({ handle, snapshot: { ...waiting, status: "playing", playheadSeconds: 5 } }));
    await waitFor(() => expect(context.started).toEqual([2, 2, 5, 5]));
    view.rerender(panel({ handle, snapshot: { ...waiting, status: "completed", retryKey: 1 } }));
    expect(fetched).toHaveLength(2); // Replay reuses decoded stems.
  });

  it("does not restart an ended track before the final video frame, but permits replay", async () => {
    const context = installAudioContext();
    api.getCurrentSoundtrack.mockResolvedValue(ready);
    const handle = createRef<SoundtrackPanelHandle>();
    const view = renderPanel({ handle });
    await screen.findByText(/Ready\./);
    handle.current!.prepareFromGesture();
    await waitFor(() => expect(context.gains).toHaveLength(2));
    view.rerender(panel({ handle, snapshot: { ...pausedSnapshot, status: "playing", playheadSeconds: 9.98 } }));
    await waitFor(() => expect(context.started).toEqual([9.98, 9.98]));
    context.sources[0]!.onended!();
    view.rerender(panel({ handle, snapshot: { ...pausedSnapshot, status: "playing", playheadSeconds: 9.99 } }));
    expect(context.started).toEqual([9.98, 9.98]);
    view.rerender(panel({ handle, snapshot: { ...pausedSnapshot, status: "completed", retryKey: 1 } }));
    view.rerender(panel({ handle, snapshot: { ...pausedSnapshot, status: "playing", retryKey: 1 } }));
    await waitFor(() => expect(context.started).toEqual([9.98, 9.98, 0, 0]));
    expect(fetched).toHaveLength(2);
  });

  it("remembers Play while soundtrack metadata is loading, without requiring a second gesture", async () => {
    const context = installAudioContext();
    let resolve!: (value: SoundtrackRender) => void;
    api.getCurrentSoundtrack.mockReturnValue(new Promise<SoundtrackRender>((done) => { resolve = done; }));
    const handle = createRef<SoundtrackPanelHandle>();
    const onPlaybackStatus = vi.fn();
    renderPanel({ handle, onPlaybackStatus, snapshot: { ...pausedSnapshot, status: "buffering" } });
    handle.current!.prepareFromGesture();
    resolve(ready);
    await waitFor(() => expect(onPlaybackStatus).toHaveBeenLastCalledWith("ready"));
    expect(context.started).toEqual([]);
    expect(fetched).toHaveLength(2);
  });

  it("retries failed soundtrack metadata from the transport gesture", async () => {
    const context = installAudioContext();
    api.getCurrentSoundtrack.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(ready);
    const handle = createRef<SoundtrackPanelHandle>();
    const onPlaybackStatus = vi.fn();
    renderPanel({ handle, onPlaybackStatus, snapshot: { ...pausedSnapshot, status: "buffering" } });
    await waitFor(() => expect(onPlaybackStatus).toHaveBeenLastCalledWith("failed"));
    handle.current!.prepareFromGesture();
    await waitFor(() => expect(onPlaybackStatus).toHaveBeenLastCalledWith("ready"));
    expect(api.getCurrentSoundtrack).toHaveBeenCalledTimes(2);
    expect(context.started).toEqual([]);
  });

  it("restores and polls an in-progress soundtrack after reload without duplicating analytics", async () => {
    api.getCurrentSoundtrack.mockResolvedValueOnce({
      ...ready, status: "running", progressPercent: 35, progressPhase: "synthesizing",
    }).mockResolvedValue(ready);
    renderPanel();
    expect(await screen.findByText("35%")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Ready\./)).toBeTruthy(), { timeout: 2_000 });
    expect(track).not.toHaveBeenCalled();
  });

  it("explains an empty story by its emptiness, not by the three-minute limit", async () => {
    renderPanel({ timeline: { ...timeline, totalDurationSeconds: 0, totalFrames: 0 } });
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: "Create music" });
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Add playable material before creating music.")).toBeTruthy();
    expect(screen.queryByText(/3 minutes/)).toBeNull();
    expect(api.requestSoundtrack).not.toHaveBeenCalled();
  });

  it("reports a soundtrack that finished while the tab was away, and only once", async () => {
    api.requestSoundtrack.mockResolvedValue({ ...ready, status: "queued", progressPhase: "queued" });
    api.getCurrentSoundtrack.mockResolvedValue({ ...ready, status: "queued", progressPhase: "queued" });
    const first = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Create music" }));
    await waitFor(() => expect(api.requestSoundtrack).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();
    first.unmount();

    // The reload sees a render it never watched finish; the request is remembered outside the tab's memory.
    api.getCurrentSoundtrack.mockResolvedValue(ready);
    const second = renderPanel();
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("story soundtrack generated", { preset: "road", duration_bucket: "under_1_minute" });
    second.unmount();

    renderPanel();
    await screen.findByText(/Ready\./);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("does not generate or loop music beyond three minutes", async () => {
    renderPanel({ timeline: { ...timeline, totalDurationSeconds: 181, totalFrames: 5_430 } });
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: "Create music" });
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Built-in music is available for stories up to 3 minutes.")).toBeTruthy();
    expect(screen.queryByText(/Add playable material/)).toBeNull();
    expect(api.requestSoundtrack).not.toHaveBeenCalled();
  });
});

const fetched: string[] = [];

/** jsdom has no Web Audio, so the mixer runs against a stub graph that records what the panel asked it to play. */
function installAudioContext() {
  const gains: { gain: { value: number } }[] = [];
  const context = { gains, started: [] as number[], stopped: 0, sources: [] as { onended: (() => void) | null }[] };
  vi.stubGlobal("fetch", (url: string) => {
    fetched.push(String(url));
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  });
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    state = "running";
    destination = {};
    decodeAudioData() { return Promise.resolve({ duration: 10 }); }
    createGain() {
      const gain = { gain: { value: 1 }, connect() {} };
      gains.push(gain);
      return gain;
    }
    createBufferSource() {
      const source = { buffer: null, onended: null, connect() {}, start(_when: number, offset: number) { context.started.push(offset); },
        stop() { context.stopped += 1; } };
      context.sources.push(source);
      return source;
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  return context;
}

interface PanelOverrides {
  readonly onPlaybackStatus?: (status: "ready" | "loading" | "failed") => void;
  readonly timeline?: StoryTimeline;
  readonly snapshot?: StoryPreviewSnapshot;
  readonly sourceAudible?: boolean;
  readonly onMixChange?: (channel: keyof SoundtrackMix, value: number) => void;
  readonly handle?: React.RefObject<SoundtrackPanelHandle | null>;
}

function panel(overrides: PanelOverrides = {}) {
  return <SoundtrackPanel
    ref={overrides.handle ?? undefined}
    story={story}
    timeline={overrides.timeline ?? timeline}
    session={session}
    snapshot={overrides.snapshot ?? pausedSnapshot}
    onPlaybackStatus={overrides.onPlaybackStatus}
    mix={mix}
    sourceAudible={overrides.sourceAudible ?? false}
    onMixChange={overrides.onMixChange ?? (() => undefined)}
  />;
}

function renderPanel(overrides: PanelOverrides = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><LocalizationProvider><AccessProvider access={access}>
    {panel(overrides)}
  </AccessProvider></LocalizationProvider></QueryClientProvider>);
  return {
    ...view,
    rerender: (element: React.ReactElement) => view.rerender(
      <QueryClientProvider client={client}><LocalizationProvider><AccessProvider access={access}>
        {element}
      </AccessProvider></LocalizationProvider></QueryClientProvider>,
    ),
  };
}

const session = { csrfToken: "csrf", profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" } } as AuthSession;
const story: Story = {
  id: "00000000-0000-4000-8000-000000000001", profileId: session.profile.id, title: "Trip", status: "draft", revision: 7,
  scenes: [], narrations: [], music: { generationStatus: "idle", applied: false },
};
const timeline: StoryTimeline = {
  storyId: story.id, revision: story.revision, sceneOrder: [], scenes: [], frameRate: { numerator: 30, denominator: 1 },
  totalFrames: 300, totalDurationSeconds: 10, transitionOverlapSeconds: 0, warnings: [], formatLimits: [],
};
const mix: SoundtrackMix = { video: 1, rhythm: 1, melody: 1, duckedMelody: 0.3 };
const pausedSnapshot: StoryPreviewSnapshot = {
  status: "paused", playheadSeconds: 0, currentTimelineIndex: 0, pendingTimelineIndex: undefined,
  retryKey: 0, revisionReset: false,
};
const presets = [
  { id: "road", version: 1, bpm: 96, default: true },
  { id: "lounge", version: 1, bpm: 84, default: false },
  { id: "dnb", version: 1, bpm: 174, default: false },
];
const ready: SoundtrackRender = {
  id: "00000000-0000-4000-8000-000000000002", status: "ready", progressPercent: 100, progressPhase: "ready",
  current: true, currentRevision: 7, storyRevision: 7, inputHash: "a".repeat(64), preset: presets[0] as SoundtrackRender["preset"],
  frameRate: timeline.frameRate, totalFrames: timeline.totalFrames, totalSampleFrames: 480_000,
  sizeBytes: 1_024, contentHash: "b".repeat(64), stems: ["rhythm", "melody"], melodyVariant: 0,
  createdAt: "2026-09-04T00:00:00.000Z",
};
const access: EffectiveAccess = {
  planVersionCode: null, roles: [], capabilities: [{ code: "story.soundtrack.generate", allowed: true, sources: [] }],
  limits: [], evaluatedAt: "2026-09-04T00:00:00.000Z",
};
