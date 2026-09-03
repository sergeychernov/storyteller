import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Scene, SceneTitle, VideoMaterial } from "../../api.js";
import { useSceneTitleEditor } from "./use-scene-title-editor.js";

describe("useSceneTitleEditor", () => {
  test("creates and preserves an unsaved default draft using the exact trimmed video duration", async () => {
    const scene = videoScene();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSceneTitleEditor(scene, false, onSave));

    act(() => result.current.add());

    expect(result.current.title).toEqual({
      text: "", position: { x: 0.5, y: 0.78 }, style: "shadow", size: "medium", color: "#FFFFFF",
      timing: { startSeconds: 0, endSeconds: 3.037 },
    });
    expect(onSave).not.toHaveBeenCalled();
    const completed = { ...result.current.title!, text: "Video title" };
    await act(async () => { await result.current.save(completed, "text"); });
    expect(onSave.mock.calls[0]?.[0].timing.endSeconds).toBe(3.037);
  });

  test("keeps optimistic changes while serializing saves and classifies only the first one as added", async () => {
    let releaseFirst!: () => void;
    const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const onSave = vi.fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSceneTitleEditor(emptyTitleScene(), false, onSave));
    act(() => result.current.add());
    const first = { ...result.current.title!, text: "First" };
    let firstSave!: Promise<void>;
    act(() => {
      result.current.preview(first);
      firstSave = result.current.save(first, "text");
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const second = { ...first, style: "plate" as const };
    let secondSave!: Promise<void>;
    act(() => {
      result.current.preview(second);
      secondSave = result.current.save(second, "appearance");
    });
    expect(result.current.title).toEqual(second);
    expect(onSave).toHaveBeenCalledTimes(1);

    releaseFirst();
    await act(async () => { await firstSave; await secondSave; });
    expect(onSave).toHaveBeenNthCalledWith(1, first, "added");
    expect(onSave).toHaveBeenNthCalledWith(2, second, "appearance");
    expect(result.current.title).toEqual(second);
  });

  test("rolls the latest failed save back to the last confirmed title", async () => {
    const persisted = title("Saved");
    const scene = { ...emptyTitleScene(), title: persisted };
    const onSave = vi.fn().mockRejectedValue(new Error("conflict"));
    const { result } = renderHook(() => useSceneTitleEditor(scene, false, onSave));
    const changed = { ...persisted, position: { x: 0.2, y: 0.3 } };

    await act(async () => {
      try { await result.current.save(changed, "position"); } catch { /* expected rollback */ }
    });

    expect(result.current.title).toEqual(persisted);
  });
});

function emptyTitleScene(): Scene {
  return {
    id: "scene", rendererId: "still-image", materials: [{
      id: "image", kind: "image", name: "image.jpg", orientation: "portrait", storageKey: "image.jpg",
      mimeType: "image/jpeg", sizeBytes: 100, width: 1080, height: 1920,
    }], durationSeconds: 5, motion: "none", render: { status: "idle" },
  };
}

function videoScene(): Scene {
  const material: VideoMaterial = {
    id: "video", kind: "video", name: "video.mp4", orientation: "portrait", storageKey: "video.mp4",
    mimeType: "video/mp4", sizeBytes: 100, width: 1080, height: 1920, hasAudio: true,
    sourceDurationSeconds: 8, audioTags: [],
    edit: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 1, endSeconds: 4.037 } },
  };
  return {
    id: "video-scene", rendererId: "video", materials: [material], durationSeconds: 5,
    motion: "none", render: { status: "idle" },
  };
}

function title(text: string): SceneTitle {
  return {
    text, position: { x: 0.5, y: 0.78 }, style: "shadow", size: "medium", color: "#FFFFFF",
    timing: { startSeconds: 0, endSeconds: 5 },
  };
}
