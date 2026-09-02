import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, SceneMaterial } from "../../api.js";
import { useMaterialContentUrl } from "./use-material-content-url.js";

const transport = vi.hoisted(() => ({
  access: vi.fn(), content: vi.fn(), audioAccess: vi.fn(), audioContent: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  getMaterialPresentation: (value: SceneMaterial) => value,
  getMaterialSource: (value: SceneMaterial) => value,
  getMaterialContentAccess: transport.access,
  getMaterialContent: transport.content,
  getMaterialAudioContentAccess: transport.audioAccess,
  getMaterialAudioContent: transport.audioContent,
  getMaterialSourceContentAccess: vi.fn(),
  getMaterialSourceContent: vi.fn(),
}));

const session = {
  csrfToken: "token", profile: { id: "profile-1", name: "Test", email: "test@example.com", language: "en" },
} as AuthSession;
const createObjectUrl = vi.fn((blob: Blob) => `blob:preview-${blob.size}-${createObjectUrl.mock.calls.length}`);
const revokeObjectUrl = vi.fn();
let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const mock of Object.values(transport)) mock.mockReset();
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
  transport.access.mockResolvedValue({ url: null });
  transport.content.mockImplementation(async () => new Blob(["preview"]));
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

const wrapper = ({ children }: { readonly children: ReactNode }) =>
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

describe("owned material content", () => {
  it("keeps Blob resources constant across 30 scene transitions and releases the final resource", async () => {
    const { result, rerender, unmount } = renderHook(({ current }) => useMaterialContentUrl({
      storyId: "story-1", material: current, session, lifecycle: "owned", retryKey: 0,
    }), { initialProps: { current: material(0) }, wrapper });

    for (let index = 0; index < 30; index += 1) {
      if (index > 0) rerender({ current: material(index) });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(createObjectUrl.mock.calls.length - revokeObjectUrl.mock.calls.length).toBe(1);
    }
    unmount();
    expect(createObjectUrl).toHaveBeenCalledTimes(30);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(30);
  });

  it("aborts an in-flight Blob fallback without creating a URL", async () => {
    let capturedSignal: AbortSignal | undefined;
    transport.content.mockImplementation(async (_token: string, _storyId: string, _materialId: string, signal: AbortSignal) => {
      capturedSignal = signal;
      return await new Promise<Blob>(() => undefined);
    });
    const { unmount } = renderHook(() => useMaterialContentUrl({
      storyId: "story-1", material: material(0), session, lifecycle: "owned", retryKey: 0,
    }), { wrapper });
    await waitFor(() => expect(capturedSignal).toBeDefined());
    unmount();
    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});

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
