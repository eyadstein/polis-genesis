import { describe, expect, it } from "vitest";
import { NewsFeed, deriveNews, describe as say, newsAt } from "../src/world3d/news";
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
  const items = deriveNews(new ReplayPlayer(replay));
  it("reports births, deaths and prison", () => {
    const kinds = items.map((i) => `${i.tick}:${i.kind}`);
    expect(kinds).toContain("20:prison");
    expect(kinds).toContain("20:birth");
    expect(kinds).toContain("20:death");
    expect(kinds).toContain("30:release");
  });
  it("names the people", () => {
    expect(say(items.find((i) => i.kind === "birth")!, town)).toContain("Cy, child of Ana and Bo");
    expect(say(items.find((i) => i.kind === "death")!, town)).toContain("Di has died");
    expect(say(items.find((i) => i.kind === "prison")!, town)).toBe("Ana was sent to prison.");
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

describe("news feed", () => {
  const frame = (tick: number, ids: number[], jailed: number[] = []) => ({
    tick,
    p: ids.map((id) => [id, 0, 0, 3, jailed.includes(id) ? 1 : 0]),
  });

  it("says nothing about the first frame", () => {
    const feed = new NewsFeed();
    feed.push(frame(1, [1, 2, 3]));
    expect(feed.items).toEqual([]);
  });

  it("does not tell the same story twice when a tick is sent again", () => {
    const feed = new NewsFeed();
    feed.push(frame(1, [1, 2]));
    feed.push(frame(2, [1, 2]));
    feed.push(frame(2, [1, 2, 3]));
    feed.push(frame(2, [1, 2, 3]));
    expect(feed.items.map((i) => `${i.kind}:${i.ids[0]}`)).toEqual(["birth:3"]);
  });

  it("ignores newcomers added before any tick has passed", () => {
    const feed = new NewsFeed();
    feed.push(frame(0, [1, 2]));
    feed.push(frame(0, [1, 2, 3, 4]));
    expect(feed.items).toEqual([]);
  });

  it("starts over when time runs backward", () => {
    const feed = new NewsFeed();
    feed.push(frame(5, [1, 2]));
    feed.push(frame(6, [1]));
    expect(feed.items).toHaveLength(1);
    feed.push(frame(1, [1, 2]));
    expect(feed.items).toEqual([]);
  });

  it("keeps only recent headlines", () => {
    const feed = new NewsFeed();
    feed.push(frame(0, [0]));
    for (let t = 1; t <= 600; t++) feed.push(frame(t, [0, t]));
    expect(feed.items.length).toBeLessThanOrEqual(500);
    expect(feed.items.filter((i) => i.kind === "birth").pop()?.ids[0]).toBe(600);
  });
});
