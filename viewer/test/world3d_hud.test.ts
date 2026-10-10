import { describe, expect, it, vi } from "vitest";
import { SimClock } from "../src/world3d/clock";
import { createHud } from "../src/world3d/hud";
import { buildLayout } from "../src/world3d/layout";
import type { Person, Town } from "../src/types";

function person(id: number, name: string, extra: Partial<Person> = {}): Person {
  return {
    id, name, alive: true, age: 9000, adult: true, generation: 0, money: 10, job: "Farmer", home: 10,
    home_kind: "Flat", home_district: 0, rent: 5, partner: null, parents: null, record: 0, jailed: false,
    friends: 0, mood: 0.5, hunger: 0.5, x: 0, y: 0,
    voice: "You are Ana, 20 years old, kind, and brave. You live in a flat.", ...extra,
  };
}

const town: Town = {
  version: 2, tick: 100, width: 64, height: 64, stats: {},
  justice: { crimes: 0, convictions: 0, acquittals: 0, jailed: 0, treasury: 0 },
  history: [], conversations: [],
  districts: Array.from({ length: 16 }, (_, id) => ({ id, homes: 4, appeal: 0.5, occupancy: 0.5, neighbor_wealth: 0.5, mean_rent: 10 })),
  people: [person(1, "Ana"), person(2, "Bo", { partner: 1 })],
};

function setup() {
  const root = document.createElement("div");
  const layout = buildLayout(town);
  const hooks = { onClosePerson: vi.fn(), onCloseBuilding: vi.fn(), onSelectPerson: vi.fn(), onSelectHome: vi.fn() };
  const clock = new SimClock(0, 100, 0);
  const hud = createHud(root, clock, town, layout, hooks);
  return { root, layout, hooks, clock, hud };
}

describe("hud", () => {
  it("starts slow and offers slower speeds", () => {
    const { root, clock } = setup();
    expect(clock.speed).toBe(0.25);
    const options = [...root.querySelectorAll("option")].map((o) => o.textContent);
    expect(options[0]).toBe("6 minutes per second");
  });

  it("shows a person with face, traits and links", () => {
    const { root, hooks, hud } = setup();
    hud.showPerson(2);
    expect(root.querySelector(".hud-portrait svg")).not.toBeNull();
    expect([...root.querySelectorAll(".hud-chip")].map((c) => c.textContent)).toEqual(["kind", "brave"]);
    const partner = [...root.querySelectorAll<HTMLButtonElement>(".hud-link")].find((b) => b.textContent === "Ana");
    partner?.click();
    expect(hooks.onSelectPerson).toHaveBeenCalledWith(1);
    const home = [...root.querySelectorAll<HTMLButtonElement>(".hud-link")].find((b) => b.textContent?.startsWith("Flat"));
    home?.click();
    expect(hooks.onSelectHome).toHaveBeenCalledWith(10);
  });

  it("shows who lives in a building and who works in a workplace", () => {
    const { root, layout, hud } = setup();
    const house = layout.homeOf.get(10)!;
    hud.showBuilding({ type: "house", ...house });
    expect(root.querySelector(".hud-card")?.textContent).toContain("Ana");
    expect(root.querySelector(".hud-card")?.textContent).toContain("Floor");
    const work = layout.workplaces.find((w) => w.job === "Farmer")!;
    hud.showBuilding({ type: "work", ...work });
    expect(root.querySelector(".hud-card h2")?.textContent).toBe("Farm");
    hud.showBuilding(null);
    expect((root.querySelector(".hud-card") as HTMLElement).hidden).toBe(true);
  });

  it("lists conversations and shows news", () => {
    const { root, hud } = setup();
    hud.setTalk([[5, 1, 2, "Good morning."]]);
    expect(root.querySelector(".hud-feed")?.textContent).toContain("Ana to Bo: Good morning.");
    hud.setTalk([]);
    expect(root.querySelector(".hud-feed")?.textContent).toContain("Nobody is talking");
    hud.setNews("Ana was sent to prison.");
    expect(root.querySelector(".hud-news")?.textContent).toContain("Ana was sent to prison.");
    hud.setNews(null);
    expect(root.querySelector(".hud-news")?.textContent).toContain("quiet day");
  });
});
