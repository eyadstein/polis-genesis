import { describe, expect, it } from "vitest";
import { DARK, JOB_COLORS, LIGHT, MAP_BACKGROUND, NO_JOB_COLOR, contrast, moodColor, wealthColor } from "../src/colors";

function rgb(text: string): string {
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(text);
  if (!m) throw new Error(text);
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

describe("contrast", () => {
  it("is 21 for black on white and 1 for the same color", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1);
  });
});

describe("text colors meet WCAG AA in both themes", () => {
  for (const [name, theme] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name}: ink, muted text, links and alerts are readable`, () => {
      for (const ground of [theme.background, theme.surface]) {
        expect(contrast(theme.ink, ground)).toBeGreaterThanOrEqual(7);
        expect(contrast(theme.muted, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.accent, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.alert, ground)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("map colors", () => {
  it("show up against the map paper (at least 3 to 1)", () => {
    for (const color of [...Object.values(JOB_COLORS), NO_JOB_COLOR]) {
      expect(contrast(color, MAP_BACKGROUND)).toBeGreaterThanOrEqual(3);
    }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(contrast(rgb(wealthColor(t)), MAP_BACKGROUND)).toBeGreaterThanOrEqual(3);
    }
    for (const m of [-1, -0.5, 0, 0.5, 1]) {
      expect(contrast(rgb(moodColor(m)), MAP_BACKGROUND)).toBeGreaterThanOrEqual(3);
    }
  });

  it("give every job its own color", () => {
    const colors = Object.values(JOB_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("run from poorest to richest and clamp odd input", () => {
    expect(wealthColor(-5)).toBe(wealthColor(0));
    expect(wealthColor(9)).toBe(wealthColor(1));
    expect(wealthColor(0)).not.toBe(wealthColor(1));
    expect(moodColor(-3)).toBe(moodColor(-1));
  });
});
