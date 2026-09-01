import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, SceneMaterial } from "../../api.js";
import { usePreviewResourceUrl } from "./use-preview-resource-url.js";

const transport = vi.hoisted(() => ({
  access: vi.fn(), content: vi.fn(), audioAccess: vi.fn(), audioContent: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  getMaterialContentAccess: transport.access,
  getMaterialContent: transport.content,
  getMaterialAudioContentAccess: transport.audioAccess,
  getMaterialAudioContent: transport.audioContent,
}));

const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;
const createObjectUrl = vi.fn((blob: Blob) => `blob:preview-${blob.size}-${createObjectUrl.mock.calls.length}`);
const revokeObjectUrl = vi.fn();

beforeEach(() => {
  transport.access.mockReset();
  transport.content.mockReset();
  transport.audioAccess.mockReset();
  transport.audioContent.mockReset();
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
  transport.access.mockResolvedValue({ url: null });
  transport.content.mockImplementation(async () => new Blob(["preview"]));
});

afterEach(() => vi.restoreAllMocks());

function material(index: number): SceneMaterial {
  if (index % 3 === 0) return {
    id: `video-${index}`, kind: "video", name: `Video ${index}`, orientation: "portrait", storageKey: `video-${index}`,
    mimeType: "video/mp4", sizeBytes: 7, width: 1080, height: 1920, hasAudio: true, audioTags: [], sourceDurationSeconds: 3,
  };
  return {
    id: `image-${index}`, kind: "image", name: `Image ${index}`, orientation: "portrait", storageKey: `image-${index}`,
    mimeType: "image/jpeg", sizeBytes: 7, width: 1080, height: 1920,
  };
}

describe("preview-specific resource loader", () => {
  it("keeps Blob resources constant across 30 scene transitions and releases the final resource", async () => {
    const abortSignals: AbortSignal[] = [];
    transport.access.mockImplementation(async (_token: string, _storyId: string, _materialId: string, signal: AbortSignal) => {
      abortSignals.push(signal);
      return { url: null };
    });
    const { result, rerender, unmount } = renderHook(({ current }) => usePreviewResourceUrl({
      storyId: "story-1", material: current, session, retryKey: 0,
    }), { initialProps: { current: material(0) } });

    for (let index = 0; index < 30; index += 1) {
      if (index > 0) rerender({ current: material(index) });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(createObjectUrl.mock.calls.length - revokeObjectUrl.mock.calls.length).toBe(1);
    }
    unmount();

    expect(createObjectUrl).toHaveBeenCalledTimes(30);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(30);
    expect(abortSignals).toHaveLength(30);
    expect(abortSignals.every(({ aborted }) => aborted)).toBe(true);
  });

  it("aborts an in-flight Blob fallback without creating a URL", async () => {
    let capturedSignal: AbortSignal | undefined;
    transport.content.mockImplementation(async (_token: string, _storyId: string, _materialId: string, signal: AbortSignal) => {
      capturedSignal = signal;
      return await new Promise<Blob>(() => undefined);
    });
    const { unmount } = renderHook(() => usePreviewResourceUrl({
      storyId: "story-1", material: material(0), session, retryKey: 0,
    }));
    await waitFor(() => expect(capturedSignal).toBeDefined());
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
