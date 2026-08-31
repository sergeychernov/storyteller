import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { Story } from "../../api.js";
import { useCollageBackground } from "./use-collage-background.js";

const { remove, track, upload } = vi.hoisted(() => ({
  remove: vi.fn(), track: vi.fn(), upload: vi.fn(),
}));
vi.mock("../../api.js", () => ({
  removeCollageBackgroundMaterial: remove,
  uploadCollageBackgroundMaterial: upload,
}));
vi.mock("@storyteller/analytics", () => ({ analytics: { track } }));

beforeEach(() => {
  remove.mockReset();
  upload.mockReset();
  track.mockReset();
});

test("tracks a custom background only after its dedicated upload succeeds", async () => {
  const changed = { id: "story", revision: 2 } as Story;
  upload.mockResolvedValue(changed);
  const onStoryChange = vi.fn();
  const { result, cleanup } = renderBackgroundHook(onStoryChange);
  const file = new File(["video"], "background.mp4", { type: "video/mp4" });

  act(() => result.current.mutate({ sceneId: "scene", action: { kind: "upload", file } }));
  expect(track).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(upload).toHaveBeenCalledWith("token", "story", "scene", file);
  expect(track).toHaveBeenNthCalledWith(1, "material uploaded", { material_kind: "video" });
  expect(track).toHaveBeenNthCalledWith(2, "collage background configured", {
    collage_background_mode: "custom_material_original",
  });
  expect(onStoryChange).toHaveBeenCalledWith(changed);
  cleanup();
});

test("tracks restoration of the darkened previous frame after the API confirms removal", async () => {
  const changed = { id: "story", revision: 3 } as Story;
  remove.mockResolvedValue(changed);
  const onStoryChange = vi.fn();
  const { result, cleanup } = renderBackgroundHook(onStoryChange);

  act(() => result.current.mutate({ sceneId: "scene", action: { kind: "remove" } }));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(track).toHaveBeenCalledWith("collage background configured", {
    collage_background_mode: "previous_scene_darkened",
  });
  expect(onStoryChange).toHaveBeenCalledWith(changed);
  cleanup();
});

function renderBackgroundHook(onStoryChange: (story: Story) => void) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const rendered = renderHook(() => useCollageBackground("token", "story", onStoryChange), { wrapper });
  return { ...rendered, cleanup: () => { rendered.unmount(); queryClient.clear(); } };
}
