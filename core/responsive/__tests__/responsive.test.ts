import { BREAKPOINTS, layoutSizeForWidth } from "@/core/responsive";

describe("layoutSizeForWidth", () => {
  it.each([
    [320, "compact"],
    [767, "compact"],
    [768, "medium"],
    [1023, "medium"],
    [1024, "expanded"],
    [1600, "expanded"],
  ])("classifies %ipx as %s", (width, expected) => {
    expect(layoutSizeForWidth(width)).toBe(expected);
  });

  it("matches the Tailwind breakpoints, so classes and hooks cannot disagree", () => {
    expect(BREAKPOINTS.medium).toBe(768);
    expect(BREAKPOINTS.expanded).toBe(1024);
  });
});
