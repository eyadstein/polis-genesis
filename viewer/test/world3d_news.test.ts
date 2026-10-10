import { describe, expect, it } from "vitest";
import { deriveNews, newsAt } from "../src/world3d/news";
import { ReplayPlayer, type Replay } from "../src/world3d/replay";
import { parseTraits } from "../src/world3d/traits";
import type { Person, Town } from "../src/types";

function person(id: number, name: string, age: number, parents: [number, number] | null = null): Person {
  return {
    id, name, alive: true, age, adult: true, generation: 0, money: 0, job: null, home: null, home_kind: null,
    home_district: null, rent: null, partner: null, parents, record: 0, jailed: false, friends: 0, mood: 0.5,
    hunger: 0.5, x: 0, y: 0, voice: null,
  };
}

const town: Town = {
  version: 2, tick: 40, width: 64, height: 64, stats: {},
  justice: { crimes: 0, convictions: 0, acquittals: 0, jailed: 0, treasury: 0 },
  history: [], districts: [], conversations: [],
  people: [person(1, "Ana", 9000), person(2, "Bo", 9000), person(3, "Cy", 100, [1, 2]), person(4, "Di", 9000)],
};

const replay: Replay = {
  version: 1, width: 64, height: 64, every: 10, actions: [], talk: [],
  frames: [
    { tick: 10, p: [[1, 0, 0, 3, 0], [2, 1, 1, 3, 0], [4, 2, 2, 3, 0]] },
    { tick: 20, p: [[1, 0, 0, 3, 1], [2, 1, 1, 3, 0], [3, 5, 5, 4, 0]] },
    { tick: 30, p: [[1, 0, 0, 3, 0], [2, 1, 1, 3, 0], [3, 5, 5, 4, 0]] },
  ],
};

describe("news", () => {
  const items = deriveNews(new ReplayPlayer(replay), town);
  it("reports births, deaths and prison", () => {
    const kinds = items.map((i) => `${i.tick}:${i.kind}`);
    expect(kinds).toContain("20:prison");
    expect(kinds).toContain("20:birth");
    expect(kinds).toContain("20:death");
    expect(kinds).toContain("30:release");
  });
  it("names the people", () => {
    expect(items.find((i) => i.kind === "birth")?.text).toContain("Cy, child of Ana and Bo");
    expect(items.find((i) => i.kind === "death")?.text).toContain("Di has died");
    expect(items.find((i) => i.kind === "prison")?.text).toBe("Ana was sent to prison.");
  });
  it("shows a headline only for a while", () => {
    expect(newsAt(items, 15)).toBeNull();
    expect(newsAt(items, 25)?.tick).toBe(20);
    expect(newsAt(items, 200)).toBeNull();
  });
});

describe("traits", () => {
  it("reads personality words", () => {
    expect(parseTraits("You are Ramian, 3 years old, tender hearted, musical, kind, and full of stamina. You live in a flat.")).toEqual([
      "tender hearted", "musical", "kind", "full of stamina",
    ]);
    expect(parseTraits("You are Hatam, 19 years old, musical, reserved, and hard to move. You work.")).toEqual(["musical", "reserved", "hard to move"]);
  });
  it("copes with nothing", () => {
    expect(parseTraits(null)).toEqual([]);
    expect(parseTraits("hello")).toEqual([]);
  });
});
