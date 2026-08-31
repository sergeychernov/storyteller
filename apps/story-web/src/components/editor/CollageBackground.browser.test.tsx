import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { AuthSession, ImageMaterial, Scene, VideoMaterial } from "../../api.js";
import { CollageBackground } from "./CollageBackground.js";

const frameState = vi.hoisted(() => ({ url: undefined as string | undefined }));
vi.mock("./use-scene-frame-url.js", () => ({
  useSceneFrameUrl: () => ({ url: frameState.url, loading: !frameState.url, failed: false, supported: true }),
}));
vi.mock("./MaterialThumbnail.js", () => ({
  MaterialThumbnail: ({ material }: { material: ImageMaterial }) => <span data-background-material={material.id} />,
}));
vi.mock("./CollageVideo.js", () => ({
  CollageVideo: ({ active, loop = false, material }: { active: boolean; loop?: boolean; material: VideoMaterial }) =>
    <video data-background-video={material.id} data-active={String(active)} data-loop={String(loop)} />,
}));

describe("CollageBackground", () => {
  test("darkens the first material when there is no ready previous-scene frame", () => {
    frameState.url = undefined;
    const { container } = render(<CollageBackground
      active
      scene={collageScene}
      previousScene={previousScene}
      storyId="story"
      session={session}
    />);

    expect(container.querySelector("[data-background-material='first']")).not.toBeNull();
    expect(container.firstElementChild?.getAttribute("style")).toContain("brightness(0.6) saturate(0.72)");
  });

  test("prefers the final frame of the immediately previous scene once it is ready", () => {
    frameState.url = "blob:previous-frame";
    const { container } = render(<CollageBackground
      active
      scene={collageScene}
      previousScene={previousScene}
      storyId="story"
      session={session}
    />);

    expect(container.querySelector("[data-background-material]")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:previous-frame");
  });

  test("keeps a custom video moving at full strength and ignores the previous frame", () => {
    frameState.url = "blob:previous-frame";
    const backgroundVideo: VideoMaterial = {
      ...firstMaterial, kind: "video", mimeType: "video/mp4", hasAudio: true, audioTags: ["ambient"],
      sourceDurationSeconds: 8,
    };
    const scene: Scene = {
      ...collageScene,
      collageBackground: { source: "material", material: backgroundVideo },
    };
    const { container } = render(<CollageBackground
      active scene={scene} previousScene={previousScene} storyId="story" session={session}
    />);

    expect(container.querySelector("[data-background-video='first']")?.getAttribute("data-active")).toBe("true");
    expect(container.querySelector("[data-background-video='first']")?.getAttribute("data-loop")).toBe("false");
    expect(container.querySelector("img[src='blob:previous-frame']")).toBeNull();
    expect(container.firstElementChild?.getAttribute("style")).toBeNull();
    expect(container.firstElementChild?.getAttribute("data-collage-background-mode")).toBe("custom-material");
  });
});

const session: AuthSession = {
  csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
  profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" },
};

const firstMaterial: ImageMaterial = {
  id: "first", kind: "image", name: "first.jpg", orientation: "portrait", storageKey: "first.jpg",
  mimeType: "image/jpeg", sizeBytes: 100, width: 900, height: 1600,
};
const secondMaterial: ImageMaterial = { ...firstMaterial, id: "second", name: "second.jpg", storageKey: "second.jpg" };
const collageScene: Scene = {
  id: "collage", rendererId: "collage", layoutId: "stack", materials: [firstMaterial, secondMaterial],
  durationSeconds: 5, motion: "none", render: { status: "idle" },
};
const previousScene: Scene = {
  id: "previous", rendererId: "still-image", layoutId: "full-frame", materials: [firstMaterial],
  durationSeconds: 5, motion: "zoom-in", render: { status: "idle" },
};
