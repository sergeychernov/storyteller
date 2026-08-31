import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CollageCard } from "./CollageCard.js";

describe("CollageCard", () => {
  test("owns the shared frame, post-crop shadow and torn silhouette", () => {
    const { container } = render(<CollageCard
      cardIndex={2}
      width="50%"
      contentWidth={450}
      contentHeight={800}
      frame={{ width: 12, color: "#F4E4C4", shape: "torn" }}
    ><span>photo</span></CollageCard>);

    const material = container.querySelector<HTMLElement>("[data-collage-card='2']");
    const card = container.querySelector<HTMLElement>("[data-collage-card-shape='torn']");
    const content = container.querySelector<HTMLElement>("[data-collage-card-content]");
    const innerEdge = container.querySelector<SVGElement>("[data-collage-card-inner-edge='torn']");
    const innerFramePath = innerEdge?.querySelector("path");
    expect(material?.style.filter).toContain("drop-shadow");
    expect(material?.style.width).toBe("50%");
    expect(material?.style.height).toBe("auto");
    expect(material?.style.aspectRatio).toBe("474 / 824");
    expect(card?.style.clipPath).toMatch(/^polygon\(/u);
    expect(content?.style.clipPath).toBe("");
    expect(innerFramePath?.getAttribute("d")).toMatch(/^M0 0H450V800H0ZM/u);
    expect(innerFramePath?.getAttribute("fill")).toBe("#F4E4C4");
    expect(innerFramePath?.getAttribute("fill-rule")).toBe("evenodd");
    expect(card?.style.borderWidth).toBe("1.111111111111111cqw");
    expect(card?.style.borderColor).toBe("rgb(244, 228, 196)");
    expect(card?.textContent).toBe("photo");
  });

  test("uses the explicit none shape instead of zero width to remove a frame", () => {
    const { container } = render(<CollageCard
      cardIndex={0}
      width="50%"
      contentWidth={450}
      contentHeight={800}
      frame={{ width: 16, color: "#F4E4C4", shape: "none" }}
    ><span>photo</span></CollageCard>);

    const material = container.querySelector<HTMLElement>("[data-collage-card='0']");
    const card = container.querySelector<HTMLElement>("[data-collage-card-shape='none']");
    expect(material?.style.aspectRatio).toBe("450 / 800");
    expect(card?.style.borderWidth).toBe("0cqw");
    expect(card?.style.clipPath).toBe("");
    expect(container.querySelector("[data-collage-card-inner-edge]")).toBeNull();
  });
});
