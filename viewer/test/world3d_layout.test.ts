import { describe, expect, it } from "vitest";
import { buildLayout, pushOut } from "../src/world3d/layout";
import type { Person, Town } from "../src/types";

function person(id: number, home: number, district: number, kind: string): Person {
  return {
    id, name: `P${id}`, alive: true, age: 9000, adult: true, generation: 0, money: 10, job: null,
    home, home_kind: kind, home_district: district, rent: 5, partner: null, parents: null, record: 0,
    jailed: false, friends: 0, mood: 0.5, hunger: 0.5, x: 0, y: 0, voice: null,
  };
}

const town: Town = {
  version: 2, tick: 100, width: 64, height: 64, stats: {},
  justice: { crimes: 0, convictions: 0, acquittals: 0, jailed: 0, treasury: 0 },
  history: [],
  districts: Array.from({ length: 16 }, (_, id) => ({ id, homes: 6, appeal: 0.5, occupancy: 0.5, neighbor_wealth: 0.5, mean_rent: 10 })),
  people: [person(1, 10, 0, "Villa"), person(2, 10, 0, "Villa"), person(3, 11, 0, "Shack"), person(4, 20, 5, "Flat")],
  conversations: [],
};

describe("layout", () => {
  const layout = buildLayout(town);
  it("builds every home", () => {
    expect(layout.houses).toHaveLength(16 * 6);
    expect(layout.homeOf.get(10)?.occupants).toEqual([1, 2]);
    expect(layout.homeOf.get(10)?.kind).toBe("Villa");
    expect(layout.homeOf.get(20)?.kind).toBe("Flat");
  });
  it("keeps buildings inside their district", () => {
    for (const h of layout.houses) {
      const dx = h.district % 4;
      const dz = Math.floor(h.district / 4);
      expect(h.x).toBeGreaterThan(dx * 16);
      expect(h.x).toBeLessThan((dx + 1) * 16);
      expect(h.z).toBeGreaterThan(dz * 16);
      expect(h.z).toBeLessThan((dz + 1) * 16);
    }
  });
  it("never puts two buildings on one plot", () => {
    const keys = [...layout.houses, ...layout.workplaces].map((b) => `${b.x},${b.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("places workplaces for every job", () => {
    const jobs = new Set(layout.workplaces.map((w) => w.job));
    expect(jobs.size).toBe(7);
  });
  it("is repeatable", () => {
    expect(buildLayout(town)).toEqual(layout);
  });
  it("pushes people out of walls", () => {
    const h = layout.houses[0]!;
    const out = pushOut(layout, h.x, h.z);
    expect(Math.abs(out.x - h.x) >= h.w / 2 || Math.abs(out.z - h.z) >= h.d / 2).toBe(true);
    expect(pushOut(layout, 0, 0)).toEqual({ x: 0, z: 0 });
  });
});
