import { forwardRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { AuthSession, ImageMaterial, Scene, VideoMaterial } from "../../api.js";
import { getEditorCopy } from "./editor-copy.js";
import { ScenePlayer } from "./ScenePlayer.js";

const frameState = vi.hoisted(() => ({ url: undefined as string | undefined }));
vi.mock("./use-scene-frame-url.js", () => ({
  useSceneFrameUrl: () => ({ url: frameState.url, loading: !frameState.url, failed: false, supported: true }),
}));
vi.mock("./SceneMedia.js", () => ({
  SceneMedia: forwardRef((_props: { slot: { material: ImageMaterial | VideoMaterial; endBehavior: string } }, _ref) => {
    const { slot } = _props;
    return <span data-scene-media={slot.material.id} data-end-behavior={slot.endBehavior} />;
  }),
}));

describe("ScenePlayer collage background", () => {
  test("uses the same treated first-card fallback while the previous-scene frame loads", () => {
    frameState.url = undefined;
    const { container } = renderPlayer(collageScene, previousScene);

    expect(container.querySelector("[data-scene-media='first']")?.closest("[data-collage-background-mode='previous-scene']"))
      .not.toBeNull();
    expect(container.querySelector("[data-collage-background-mode='previous-scene']")?.getAttribute("style"))
      .toContain("brightness(0.6) saturate(0.72)");
  });

  test("uses the final frame of the immediately previous scene once it is ready", () => {
    frameState.url = "blob:previous-frame";
    const { container } = renderPlayer(collageScene, previousScene);

    expect(container.querySelector("[data-collage-background-mode='previous-scene'] img")?.getAttribute("src"))
      .toBe("blob:previous-frame");
  });

  test("keeps a custom video at full strength and holds its final frame", () => {
    frameState.url = "blob:previous-frame";
    const backgroundVideo: VideoMaterial = {
      ...firstMaterial, kind: "video", mimeType: "video/mp4", hasAudio: true, audioTags: ["ambient"],
      sourceDurationSeconds: 8,
    };
    const scene: Scene = { ...collageScene, collageBackground: { source: "material", material: backgroundVideo } };
    const { container } = renderPlayer(scene, previousScene);

    const background = container.querySelector("[data-collage-background-mode='custom-material']");
    expect(background?.querySelector("[data-scene-media='first']")?.getAttribute("data-end-behavior")).toBe("hold");
    expect(background?.querySelector("img[src='blob:previous-frame']")).toBeNull();
    expect(background?.getAttribute("style")).toBeNull();
  });
});

function renderPlayer(scene: Scene, previousSceneValue?: Scene) {
  return render(<ScenePlayer
    scene={scene}
    previousScene={previousSceneValue}
    copy={getEditorCopy("en")}
    storyId="story"
    session={session}
    localTimeSeconds={0}
    playing
    active
    muted
    reducedMotion={false}
    preload="auto"
    retryKey={0}
  />);
}

const session: AuthSession = {
  csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
  profile: { id: "profile", name: "Test", email: "test@example.com", language: "en" },
};

const firstMaterial: ImageMaterial = {
  id: "first", kind: "image", name: "first.jpg", orientation: "landscape", storageKey: "first.jpg",
  mimeType: "image/jpeg", sizeBytes: 100, width: 1600, height: 900,
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
