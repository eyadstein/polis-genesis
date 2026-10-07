import { describe, expect, it } from "vitest";
import { CELL, legend, mapSvg, wealthRanks } from "../src/map";
import { living } from "../src/stats";
import { makeTown } from "./fixtures";

describe("the town map", () => {
  const town = makeTown();

  it("has one dot per living person and a shaded rectangle per district", () => {
    const svg = mapSvg(town, "wealth", null);
    expect(svg.match(/class="dot"/g)).toHaveLength(5);
    expect(svg.match(/class="district"/g)).toHaveLength(16);
    expect(svg).toContain('role="img"');
  });

  it("puts people where they stand, scaled to the map", () => {
    const svg = mapSvg(town, "job", null);
    expect(svg).toContain(`viewBox="0 0 ${64 * CELL} ${64 * CELL}"`);
    expect(svg).toContain(`cx="${3 * CELL + CELL / 2}" cy="${2 * CELL + CELL / 2}"`);
  });

  it("marks the chosen person with a bigger dot", () => {
    const plain = mapSvg(town, "wealth", null);
    const chosen = mapSvg(town, "wealth", 1);
    expect(plain).not.toContain('r="6"');
    expect(chosen.match(/r="6"/g)).toHaveLength(1);
  });

  it("makes children smaller than adults", () => {
    const svg = mapSvg(town, "wealth", null);
    expect(svg).toContain('r="2.4"');
    expect(svg).toContain('r="3.4"');
  });

  it("changes colors with the mode", () => {
    expect(mapSvg(town, "wealth", null)).not.toBe(mapSvg(town, "mood", null));
    expect(mapSvg(town, "job", null)).toContain("#5a7d2a");
  });

  it("ranks the poorest 0 and the richest 1", () => {
    const ranks = wealthRanks(living(town));
    expect(ranks.get(0)).toBe(1);
    expect(Math.min(...ranks.values())).toBe(0);
  });

  it("explains its colors", () => {
    expect(legend("wealth")).toContain("richest");
    expect(legend("mood")).toContain("happy");
    expect(legend("job")).toContain("Farmer");
  });

  it("escapes names in tooltips", () => {
    const evil = makeTown();
    evil.people[0] = { ...evil.people[0]!, name: `<img src=x onerror=alert(1)>` };
    expect(mapSvg(evil, "wealth", null)).not.toContain("<img");
  });
});
