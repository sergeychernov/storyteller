import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accessManagementHeaderSx, userShowTabsProps } from "./responsive-layout.js";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("responsive admin layout", () => {
  it("keeps all user tabs reachable without widening the page", () => {
    expect(userShowTabsProps).toEqual({
      allowScrollButtonsMobile: false,
      className: "user-show-tabs",
      scrollButtons: "auto",
      variant: "scrollable",
    });
  });

  it("stacks the access heading and action on mobile", () => {
    expect(accessManagementHeaderSx).toMatchObject({
      alignItems: { xs: "stretch", sm: "center" },
      flexDirection: { xs: "column", sm: "row" },
      minWidth: 0,
    });
  });

  it("lets the layout and tab scroller shrink inside the viewport", () => {
    expect(styles).toMatch(/\.user-show-tabs \.MuiTabs-scroller\s*\{[^}]*min-width:\s*0/);
    expect(styles).toMatch(/\.layout\.layout,[^{]*\{[^}]*min-width:\s*0/);
  });
});
