import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { LocalizationProvider } from "@storyteller/web-ui";
import { StoryCard } from "./StoryCard.js";

const storyPageLoader = vi.hoisted(() => ({ preload: vi.fn() }));

vi.mock("../pages/LazyStoryPage.js", () => ({ preloadStoryPage: storyPageLoader.preload }));

describe("StoryCard", () => {
  test("prefetches the editor for pointer and keyboard navigation", () => {
    render(
      <MemoryRouter>
        <LocalizationProvider>
          <StoryCard story={{ id: "story", profileId: "profile", title: "Trip", status: "draft", sceneCount: 2, revision: 1 }} />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /Trip/u });
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);

    expect(storyPageLoader.preload).toHaveBeenCalledTimes(2);
  });
});
