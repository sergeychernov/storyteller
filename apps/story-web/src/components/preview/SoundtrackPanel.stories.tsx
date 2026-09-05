import type { SoundtrackMix } from "@storyteller/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AccessProvider } from "../../access-control.js";
import type { AuthSession, EffectiveAccess, SoundtrackRender, Story, StoryTimeline } from "../../api.js";
import { SoundtrackPanel } from "./SoundtrackPanel.js";
import type { StoryPreviewSnapshot } from "./use-story-preview-controller.js";

let currentRender: SoundtrackRender | null = null;

installSoundtrackFixtures();

/** Answers the panel's own endpoints so stories never depend on a running API. */
function installSoundtrackFixtures(): void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const { pathname } = new URL(requestUrl, globalThis.location.href);
    if (pathname === "/soundtrack-presets") return respond(presets);
    if (/\/soundtracks\/current$/u.test(pathname)) {
      return currentRender ? respond(currentRender) : respond({ message: "not found", code: "soundtrack_not_found" }, 404);
    }
    if (/\/soundtracks$/u.test(pathname)) {
      return respond({ ...readyRender, status: "queued", progressPercent: 1, progressPhase: "queued" }, 202);
    }
    return originalFetch(input, init);
  };
}

function respond(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function pausedSnapshot(): StoryPreviewSnapshot {
  return {
    status: "paused", playheadSeconds: 0, currentTimelineIndex: 0, pendingTimelineIndex: undefined,
    retryKey: 0, revisionReset: false,
  };
}

const session = {
  csrfToken: "storybook", profile: { id: "storybook", name: "Storybook", email: "storybook@example.com", language: "ru" },
} as AuthSession;

const story: Story = {
  id: "00000000-0000-4000-8000-000000000001", profileId: session.profile.id, title: "Дорога к морю",
  status: "draft", revision: 7, scenes: [], narrations: [], music: { generationStatus: "idle", applied: false },
};

const timeline: StoryTimeline = {
  storyId: story.id, revision: story.revision, sceneOrder: [], scenes: [], frameRate: { numerator: 30, denominator: 1 },
  totalFrames: 2_700, totalDurationSeconds: 90, transitionOverlapSeconds: 0, warnings: [], formatLimits: [],
};

const presets = [
  { id: "road", version: 1, bpm: 96, default: true },
  { id: "lounge", version: 1, bpm: 84, default: false },
  { id: "dnb", version: 1, bpm: 174, default: false },
];

const readyRender: SoundtrackRender = {
  id: "00000000-0000-4000-8000-000000000002", status: "ready", progressPercent: 100, progressPhase: "ready",
  current: true, currentRevision: story.revision, storyRevision: story.revision, inputHash: "a".repeat(64),
  preset: presets[0] as SoundtrackRender["preset"], frameRate: timeline.frameRate, totalFrames: timeline.totalFrames,
  totalSampleFrames: 90 * 48_000, sizeBytes: 2_150_400, contentHash: "b".repeat(64),
  stems: ["rhythm", "melody"], melodyVariant: 1, createdAt: "2026-09-04T00:00:00.000Z",
};

const capability = (allowed: boolean): EffectiveAccess => ({
  planVersionCode: null, roles: [], capabilities: [{ code: "story.soundtrack.generate", allowed, sources: [] }],
  limits: [], evaluatedAt: "2026-09-04T00:00:00.000Z",
});
const granted = capability(true);
const denied = capability(false);

interface PlaygroundArgs {
  readonly render: SoundtrackRender | null;
  readonly timeline: StoryTimeline;
  readonly snapshot: StoryPreviewSnapshot;
  readonly mix: SoundtrackMix;
  readonly sourceAudible: boolean;
  readonly canGenerate: boolean;
}

/** Each story owns its query client and fixture so the panel starts from a predictable server state. */
function SoundtrackPanelPlayground({ render, canGenerate, mix: initialMix, ...args }: PlaygroundArgs) {
  const [mix, setMix] = useState(initialMix);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  currentRender = render;
  // The panel is designed against the dark preview page, so the stories carry that ground with them.
  return <div style={{ width: 420, maxWidth: "100vw", padding: 20, borderRadius: 14, background: "#171714" }}>
    <QueryClientProvider client={client}>
      <AccessProvider access={canGenerate ? granted : denied}>
        <SoundtrackPanel
          story={story}
          session={session}
          timeline={args.timeline}
          snapshot={args.snapshot}
          mix={mix}
          sourceAudible={args.sourceAudible}
          onMixChange={(channel, value) => setMix((current) => ({ ...current, [channel]: value }))}
        />
      </AccessProvider>
    </QueryClientProvider>
  </div>;
}

const meta = {
  title: "Preview/Soundtrack panel",
  component: SoundtrackPanelPlayground,
  parameters: { layout: "centered" },
  args: {
    render: null,
    timeline,
    snapshot: pausedSnapshot(),
    mix: { video: 1, rhythm: 1, melody: 1, duckedMelody: 0.3 },
    sourceAudible: false,
    canGenerate: true,
  },
  argTypes: {
    render: { control: false },
    timeline: { control: false },
    snapshot: { control: false },
    sourceAudible: { control: "boolean" },
    canGenerate: { control: "boolean" },
  },
} satisfies Meta<typeof SoundtrackPanelPlayground>;

export default meta;
type StoryType = StoryObj<typeof meta>;

/** Nothing generated yet: one button, and only the video fader is live. */
export const Empty: StoryType = {};

export const Generating: StoryType = {
  args: { render: { ...readyRender, status: "running", progressPercent: 42, progressPhase: "encoding" } },
};

/** The button becomes "another melody" and every fader is live. */
export const Ready: StoryType = {
  args: { render: readyRender },
};

/** While the scene carries source audio the melody plays at melody × ducked. */
export const DuckedUnderSourceAudio: StoryType = {
  args: { render: readyRender, sourceAudible: true, mix: { video: 1, rhythm: 1, melody: 0.8, duckedMelody: 0.2 } },
};

export const Failed: StoryType = {
  args: { render: { ...readyRender, status: "failed", progressPercent: 48, progressPhase: "encoding", error: "encoder exited" } },
};

/** A soundtrack made for an older cut of the story cannot be used as it is. */
export const StaleAfterEdit: StoryType = {
  args: { render: { ...readyRender, current: false, currentRevision: 9 } },
};

export const LongerThanThreeMinutes: StoryType = {
  args: { timeline: { ...timeline, totalFrames: 5_430, totalDurationSeconds: 181 } },
};

/** Creators without the capability see nothing at all rather than a disabled panel. */
export const WithoutCapability: StoryType = {
  args: { render: readyRender, canGenerate: false },
};
