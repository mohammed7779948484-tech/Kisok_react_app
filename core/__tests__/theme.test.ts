import fs from "node:fs";
import path from "node:path";

import { NAV_THEME, radius, TOKENS } from "@/core/theme";

/**
 * `core/theme` restates colour tokens because React Navigation cannot read CSS
 * variables. That is a second copy of the truth, and a second copy drifts — a
 * designer changes `--background` in `global.css` and the navigator keeps
 * painting the old colour behind every screen, which looks like a rendering bug
 * rather than a stale constant.
 *
 * This test reads `global.css` and fails the moment they disagree.
 */
function cssTokens(selector: string): Record<string, string> {
  const css = fs.readFileSync(path.join(process.cwd(), "global.css"), "utf8");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n {2}\\}`).exec(css);
  const body = block?.[1];
  if (!body) throw new Error(`No \`${selector}\` block in global.css`);

  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((match) => [
      String(match[1]),
      String(match[2]).trim(),
    ]),
  );
}

describe("navigation theme", () => {
  it.each([
    ["light", ":root"],
    ["dark", ".dark:root"],
  ])("%s tokens still match global.css", (scheme, selector) => {
    const css = cssTokens(selector);
    const declared = TOKENS[scheme as keyof typeof TOKENS];

    // TOKENS uses camelCase keys; global.css uses kebab-case variable names.
    const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

    for (const [name, value] of Object.entries(declared)) {
      expect({ scheme, name, value }).toEqual({ scheme, name, value: css[kebab(name)] });
    }
    // ...and every colour token in the CSS is mirrored, so a NEW token cannot be
    // added to global.css and silently missed here.
    const cssColours = Object.keys(css).filter((name) => name !== "radius");
    const declaredNames = Object.keys(declared).map(kebab);
    expect(cssColours.filter((name) => !declaredNames.includes(name))).toEqual([]);
  });

  it("exposes the colours React Navigation paints", () => {
    for (const scheme of ["light", "dark"] as const) {
      const { colors } = NAV_THEME[scheme];
      // Every one of these is a surface the navigator draws itself; a missing
      // value silently falls back to React Navigation's own default.
      for (const key of ["background", "card", "text", "border", "primary", "notification"]) {
        expect(colors[key as keyof typeof colors]).toMatch(/^hsl\(/);
      }
    }
  });

  it("maps each navigator slot to the token it is meant to show", () => {
    // Without this, swapping `background` and `card` inside navigationTheme
    // still produces two valid hsl() strings and every other test passes.
    for (const scheme of ["light", "dark"] as const) {
      const { colors } = NAV_THEME[scheme];
      const t = TOKENS[scheme];
      expect(colors.background).toBe(`hsl(${t.background})`);
      expect(colors.card).toBe(`hsl(${t.card})`);
      expect(colors.text).toBe(`hsl(${t.foreground})`);
      expect(colors.border).toBe(`hsl(${t.border})`);
      expect(colors.primary).toBe(`hsl(${t.primary})`);
      expect(colors.notification).toBe(`hsl(${t.destructive})`);
    }
  });

  it("keeps the exported radius equal to --radius", () => {
    // Excluded from the colour comparison above because it is not a colour, so
    // it needs its own assertion or it can drift unnoticed.
    expect(radius).toBe(cssTokens(":root").radius);
  });

  it("uses different backgrounds for light and dark", () => {
    expect(NAV_THEME.light.colors.background).not.toBe(NAV_THEME.dark.colors.background);
    expect(NAV_THEME.dark.dark).toBe(true);
  });
});
