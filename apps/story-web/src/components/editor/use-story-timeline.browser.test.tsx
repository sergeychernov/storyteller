import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { expect, test, vi } from "vitest";
import type { AuthSession, StoryTimeline } from "../../api.js";
import { useStoryTimeline } from "./use-story-timeline.js";

const getStoryTimeline = vi.hoisted(() => vi.fn());
vi.mock("../../api.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api.js")>(),
  getStoryTimeline,
}));

test("keys server timing by profile, story and confirmed revision without carrying old timing forward", async () => {
  const revisionOne = deferred<StoryTimeline>();
  const revisionTwo = deferred<StoryTimeline>();
  getStoryTimeline.mockReset();
  getStoryTimeline.mockImplementationOnce(() => revisionOne.promise).mockImplementationOnce(() => revisionTwo.promise);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result, rerender, unmount } = renderHook(
    ({ revision }) => useStoryTimeline(session, "story", revision),
    { wrapper, initialProps: { revision: 1 } },
  );

  await waitFor(() => expect(getStoryTimeline).toHaveBeenCalledTimes(1));
  revisionOne.resolve(timeline(1, 5));
  await waitFor(() => expect(result.current.data?.revision).toBe(1));

  rerender({ revision: 2 });
  expect(result.current.data).toBeUndefined();
  expect(result.current.isFetching).toBe(true);
  await waitFor(() => expect(getStoryTimeline).toHaveBeenCalledTimes(2));
  revisionTwo.resolve(timeline(2, 8));
  await waitFor(() => expect(result.current.data?.totalDurationSeconds).toBe(8));
  expect(queryClient.getQueryData(["story-timeline", "profile", "story", 1])).toEqual(timeline(1, 5));
  expect(queryClient.getQueryData(["story-timeline", "profile", "story", 2])).toEqual(timeline(2, 8));

  unmount();
  queryClient.clear();
});

const session = {
  csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z", profile: { id: "profile", language: "en" },
} as AuthSession;

function timeline(revision: number, totalDurationSeconds: number): StoryTimeline {
  return {
    storyId: "story", revision, sceneOrder: [], scenes: [], frameRate: { numerator: 30, denominator: 1 },
    totalFrames: Math.round(totalDurationSeconds * 30), totalDurationSeconds,
    transitionOverlapSeconds: 0, warnings: [], formatLimits: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
