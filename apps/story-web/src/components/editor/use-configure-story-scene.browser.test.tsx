import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { expect, test, vi } from "vitest";
import type { Story } from "../../api.js";
import { useConfigureStoryScene } from "./use-configure-story-scene.js";

const configureStoryScene = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
vi.mock("../../api.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api.js")>(),
  configureStoryScene,
}));
vi.mock("@storyteller/analytics", () => ({ analytics: { track } }));

test("serializes consecutive composition changes for the same revisioned story", async () => {
  const first = deferred<Story>();
  const second = deferred<Story>();
  configureStoryScene.mockReset();
  track.mockReset();
  configureStoryScene.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(() => useConfigureStoryScene("token", "story"), { wrapper });

  act(() => {
    result.current.mutate({ sceneId: "scene", change: { collage: collage(12) } });
    result.current.mutate({ sceneId: "scene", change: { collage: collage(16) } });
  });

  await waitFor(() => expect(configureStoryScene).toHaveBeenCalledTimes(1));
  first.resolve({ id: "story", revision: 2 } as Story);
  await waitFor(() => expect(configureStoryScene).toHaveBeenCalledTimes(2));
  second.resolve({ id: "story", revision: 3 } as Story);
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(configureStoryScene.mock.calls.map((call) => call[3].collage.frame.width)).toEqual([12, 16]);
  expect(track).not.toHaveBeenCalled();

  unmount();
  queryClient.clear();
});

test("strips local row outcome metadata and tracks the direction only after the save succeeds", async () => {
  configureStoryScene.mockReset();
  track.mockReset();
  const pending = deferred<Story>();
  configureStoryScene.mockReturnValue(pending.promise);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(() => useConfigureStoryScene("token", "story"), { wrapper });

  act(() => result.current.mutate({
    sceneId: "scene",
    change: {
      collage: { ...collage(12), rowDirection: "random" },
      outcome: { collageRowDirectionConfigured: "random" },
    },
  }));
  await waitFor(() => expect(configureStoryScene).toHaveBeenCalledTimes(1));
  expect(configureStoryScene).toHaveBeenCalledWith("token", "story", "scene", {
    collage: { ...collage(12), rowDirection: "random" },
  });
  expect(track).not.toHaveBeenCalled();

  pending.resolve({ id: "story", revision: 2 } as Story);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(track).toHaveBeenCalledWith("collage row direction configured", { collage_row_direction: "random" });

  unmount();
  queryClient.clear();
});

function collage(width: 12 | 16 | 20 | 24) {
  return {
    frame: { width, color: "#FFFFFF", shape: "straight" as const },
    entryDurationSeconds: 2,
    straightCards: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
