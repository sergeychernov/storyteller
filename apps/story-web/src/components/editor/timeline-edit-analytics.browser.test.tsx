import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError, type ImageMaterial, type Scene, type Story } from "../../api.js";
import { useMoveSceneMaterial } from "./use-move-scene-material.js";
import { useReorderStoryScenes } from "./use-reorder-story-scenes.js";

const reorderStoryScenes = vi.hoisted(() => vi.fn());
const moveSceneMaterials = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
vi.mock("../../api.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api.js")>(),
  reorderStoryScenes,
  moveSceneMaterials,
}));
vi.mock("@storyteller/analytics", () => ({ analytics: { track } }));

beforeEach(() => {
  reorderStoryScenes.mockReset();
  moveSceneMaterials.mockReset();
  track.mockReset();
});

test("tracks a scene reorder only after the API confirms the new revision", async () => {
  const pending = deferred<Story>();
  reorderStoryScenes.mockReturnValue(pending.promise);
  const fixture = renderReorder();

  act(() => fixture.result.current.mutate({ ids: ["b", "a"], expectedRevision: 1 }));
  await waitFor(() => expect(reorderStoryScenes).toHaveBeenCalledOnce());
  expect(fixture.queryClient.getQueryData<Story>(["story", "story"])?.scenes.map(({ id }) => id)).toEqual(["b", "a"]);
  expect(track).not.toHaveBeenCalled();

  pending.resolve({ ...story, revision: 2, scenes: [sceneB, sceneA] });
  await waitFor(() => expect(fixture.result.current.isSuccess).toBe(true));
  expect(track).toHaveBeenCalledWith("timeline edited", { timeline_edit_kind: "scene_reordered" });
  fixture.dispose();
});

test("does not track an optimistic reorder that ends in a revision conflict", async () => {
  reorderStoryScenes.mockRejectedValue(new ApiError("changed", 409, "story_revision_conflict"));
  const fixture = renderReorder();

  act(() => fixture.result.current.mutate({ ids: ["b", "a"], expectedRevision: 1 }));
  await waitFor(() => expect(fixture.result.current.isError).toBe(true));
  expect(fixture.queryClient.getQueryData<Story>(["story", "story"])?.scenes.map(({ id }) => id)).toEqual(["a", "b"]);
  expect(track).not.toHaveBeenCalled();
  fixture.dispose();
});

test("tracks a cross-scene material move only after the API confirms it", async () => {
  const pending = deferred<Story>();
  moveSceneMaterials.mockReturnValue(pending.promise);
  const fixture = renderMove();

  act(() => fixture.result.current.mutate({
    sourceSceneId: "a", materialId: "photo", targetSceneId: "b", targetIndex: 0, expectedRevision: 1,
  }));
  await waitFor(() => expect(moveSceneMaterials).toHaveBeenCalledOnce());
  expect(fixture.queryClient.getQueryData<Story>(["story", "story"])?.scenes[0]?.materials).toEqual([]);
  expect(track).not.toHaveBeenCalled();

  pending.resolve({ ...story, revision: 2, scenes: [{ ...sceneA, materials: [] }, { ...sceneB, materials: [photo] }] });
  await waitFor(() => expect(fixture.result.current.isSuccess).toBe(true));
  expect(track).toHaveBeenCalledWith("timeline edited", { timeline_edit_kind: "material_moved_between_scenes" });
  fixture.dispose();
});

test("does not track a failed optimistic material move", async () => {
  moveSceneMaterials.mockRejectedValue(new Error("offline"));
  const fixture = renderMove();

  act(() => fixture.result.current.mutate({
    sourceSceneId: "a", materialId: "photo", targetSceneId: "b", targetIndex: 0, expectedRevision: 1,
  }));
  await waitFor(() => expect(fixture.result.current.isError).toBe(true));
  expect(fixture.queryClient.getQueryData<Story>(["story", "story"])?.scenes[0]?.materials).toEqual([photo]);
  expect(track).not.toHaveBeenCalled();
  fixture.dispose();
});

function renderReorder() {
  return renderMutation(() => useReorderStoryScenes("csrf", "story"));
}

function renderMove() {
  return renderMutation(() => useMoveSceneMaterial("csrf", "story"));
}

function renderMutation<Result>(hook: () => Result) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  queryClient.setQueryData(["story", "story"], story);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const rendered = renderHook(hook, { wrapper });
  return { ...rendered, queryClient, dispose: () => { rendered.unmount(); queryClient.clear(); } };
}

const photo: ImageMaterial = {
  id: "photo", kind: "image", name: "photo.jpg", orientation: "portrait", storageKey: "photo.jpg",
  mimeType: "image/jpeg", sizeBytes: 100, width: 100, height: 200,
};
const sceneA: Scene = { id: "a", materials: [photo], durationSeconds: 5, motion: "none", render: { status: "idle" } };
const sceneB: Scene = { id: "b", materials: [], durationSeconds: 5, motion: "none", render: { status: "idle" } };
const story = {
  id: "story", profileId: "profile", revision: 1, status: "draft", scenes: [sceneA, sceneB],
  narrations: [], music: { generationStatus: "idle", applied: false },
} as Story;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
