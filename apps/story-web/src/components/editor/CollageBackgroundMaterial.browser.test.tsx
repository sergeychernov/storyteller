import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { AuthSession, ImageMaterial, Scene } from "../../api.js";
import { CollageBackgroundMaterial } from "./CollageBackgroundMaterial.js";
import { getEditorCopy } from "./editor-copy.js";

vi.mock("../../access-control.js", () => ({ useCapability: () => true }));
vi.mock("./use-scene-frame-url.js", () => ({
  useSceneFrameUrl: () => ({ url: "blob:previous", loading: false, failed: false, supported: true }),
}));
vi.mock("./MaterialThumbnail.js", () => ({
  MaterialThumbnail: ({ material }: { material: ImageMaterial }) => <span data-thumbnail={material.id} />,
}));

describe("CollageBackgroundMaterial", () => {
  test("uses a direct file input beside materials for a custom background", async () => {
    const onUpload = vi.fn();
    const user = userEvent.setup();
    render(<CollageBackgroundMaterial
      scene={scene}
      previousScene={previousScene}
      copy={getEditorCopy("ru")}
      storyId="story"
      session={session}
      disabled={false}
      uploading={false}
      onUpload={onUpload}
      onRemove={vi.fn()}
    />);

    expect(screen.getByText("Предыдущий кадр · затемнён")).not.toBeNull();
    const input = screen.getByLabelText("Загрузить фон");
    expect((input as HTMLInputElement).type).toBe("file");
    const file = new File(["image"], "background.png", { type: "image/png" });
    await user.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  test("shows the separate custom resource and removes it without touching cards", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<CollageBackgroundMaterial
      scene={{ ...scene, collageBackground: { source: "material", material: customBackground } }}
      previousScene={previousScene}
      copy={getEditorCopy("ru")}
      storyId="story"
      session={session}
      disabled={false}
      uploading={false}
      onUpload={vi.fn()}
      onRemove={onRemove}
    />);

    expect(screen.getByText("Свой · без затемнения")).not.toBeNull();
    expect(document.querySelector("[data-thumbnail='background']")).not.toBeNull();
    expect(document.querySelector("[data-collage-background-source='material']")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Удалить свой фон" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

const session: AuthSession = {
  csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
  profile: { id: "profile", name: "Test", email: "test@example.com", language: "ru" },
};
const card: ImageMaterial = {
  id: "card", kind: "image", name: "card.png", orientation: "landscape", storageKey: "card.png",
  mimeType: "image/png", sizeBytes: 100, width: 1600, height: 900,
};
const customBackground: ImageMaterial = { ...card, id: "background", name: "background.png", storageKey: "background.png" };
const scene: Scene = {
  id: "scene", rendererId: "collage", materials: [card, { ...card, id: "card-2" }],
  collageBackground: { source: "previous-scene" }, durationSeconds: 5, motion: "none", render: { status: "idle" },
};
const previousScene: Scene = {
  id: "previous", rendererId: "still-image", materials: [card], durationSeconds: 5,
  motion: "zoom-in", render: { status: "idle" },
};
