import { describe, expect, it } from "vitest";
import { AFFLUENT_CAR_THRESHOLD, FOUNTAIN_PLAZA_SIZE, buildLayout, layoutSignature, pushOut } from "../src/world3d/layout";
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
    const buildings = [...layout.houses, ...layout.workplaces];
    for (let i = 0; i < buildings.length; i++) {
      const a = buildings[i]!;
      for (let j = i + 1; j < buildings.length; j++) {
        const b = buildings[j]!;
        expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2).toBe(true);
      }
      for (const road of layout.roads) {
        const overlapX = Math.abs(a.x - road.x) < (a.w + (road.axis === "x" ? road.length : road.width)) / 2;
        const overlapZ = Math.abs(a.z - road.z) < (a.d + (road.axis === "z" ? road.length : road.width)) / 2;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
  });
  it("places workplaces for every job", () => {
    const jobs = new Set(layout.workplaces.map((w) => w.job));
    expect(jobs.size).toBe(7);
  });
  it("is repeatable", () => {
    expect(buildLayout(town)).toEqual(layout);
  });
  it("gives every district fountain a dedicated park lot away from buildings and trees", () => {
    expect(layout.fountains).toHaveLength(16);
    for (const f of layout.fountains) {
      expect(layout.lots.some((lot) => lot.use === "park" && lot.x === f.x && lot.z === f.z)).toBe(true);
      expect(layout.trees.some((tree) => Math.hypot(tree.x - f.x, tree.z - f.z) < 1.25 + 0.58)).toBe(false);
      for (const building of [...layout.houses, ...layout.workplaces]) {
        const separatedX = Math.abs(f.x - building.x) >= 1.25 + building.w / 2;
        const separatedZ = Math.abs(f.z - building.z) >= 1.25 + building.d / 2;
        expect(separatedX || separatedZ).toBe(true);
      }
    }
  });
  it("builds a connected street grid, waterfront beach, and two road-aligned bridges", () => {
    expect(layout.roads).toHaveLength(34);
    expect(layout.roads.some((road) => road.axis === "x" && road.z === 16)).toBe(true);
    expect(layout.waterfront.beach.x - layout.waterfront.beach.width / 2).toBe(town.width);
    expect(layout.waterfront.promenade.x).toBeGreaterThan(town.width);
    expect(layout.bridges).toHaveLength(2);
    for (const fountain of layout.fountains) {
      for (const road of layout.roads) {
        const along = road.axis === "x" ? Math.max(Math.abs(fountain.x - road.x) - road.length / 2, 0) : Math.max(Math.abs(fountain.z - road.z) - road.length / 2, 0);
        const across = Math.abs((road.axis === "x" ? fountain.z - road.z : fountain.x - road.x));
        expect(Math.hypot(along, across)).toBeGreaterThanOrEqual(FOUNTAIN_PLAZA_SIZE / 2 + road.width / 2 - 0.001);
      }
    }
    for (let i = 0; i < layout.trees.length; i++) {
      const tree = layout.trees[i]!;
      const radius = tree.s * 0.5;
      for (const building of [...layout.houses, ...layout.workplaces]) {
        const nearestX = Math.max(Math.abs(tree.x - building.x) - building.w / 2 - 0.12, 0);
        const nearestZ = Math.max(Math.abs(tree.z - building.z) - building.d / 2 - 0.12, 0);
        expect(Math.hypot(nearestX, nearestZ)).toBeGreaterThanOrEqual(radius - 0.001);
      }
      for (const fountain of layout.fountains) {
        expect(Math.hypot(tree.x - fountain.x, tree.z - fountain.z)).toBeGreaterThanOrEqual(radius + 1.25 - 0.001);
      }
      for (const road of layout.roads) {
        const distance = road.axis === "x" ? Math.abs(tree.z - road.z) : Math.abs(tree.x - road.x);
        const along = road.axis === "x" ? tree.x : tree.z;
        expect(distance >= road.width / 2 + radius || Math.abs(along - (road.axis === "x" ? road.x : road.z)) > road.length / 2 + radius).toBe(true);
      }
      for (let j = i + 1; j < layout.trees.length; j++) {
        const other = layout.trees[j]!;
        expect(Math.hypot(tree.x - other.x, tree.z - other.z)).toBeGreaterThanOrEqual((tree.s + other.s) * 0.5 - 0.001);
      }
    }
    for (const bridge of layout.bridges) {
      expect(layout.roads.some((road) => road.axis === "x" && road.z === bridge.z)).toBe(true);
      expect(bridge.x - bridge.length / 2).toBeLessThan(town.width);
      expect(bridge.x + bridge.length / 2).toBeGreaterThan(town.width + 23);
    }
  });
  it("keeps the castle and mountain range beyond the waterfront, away from homes and workplaces", () => {
    // The castle's plinth is 15 units wide; keep its full footprint on the far bank.
    expect(layout.castle.x - 7.5).toBeGreaterThan(town.width + 23);
    expect(layout.castle.z).toBe(layout.bridges[1]?.z);
    expect(layout.mountains).toHaveLength(3);
    for (const mountain of layout.mountains) {
      expect(mountain.x - mountain.radius).toBeGreaterThan(town.width);
      expect(mountain.height).toBeGreaterThan(0);
    }
    for (const building of [...layout.houses, ...layout.workplaces]) {
      expect(building.x + building.w / 2).toBeLessThan(layout.castle.x - 5.5);
    }
  });
  it("parks one deterministic visual car by each affluent occupied home", () => {
    const wealthyTown: Town = {
      ...town,
      people: town.people.map((p) => ({
        ...p,
        money: p.id === 1 ? AFFLUENT_CAR_THRESHOLD : p.id === 3 ? AFFLUENT_CAR_THRESHOLD - 1 : p.id === 4 ? 500 : p.money,
      })),
    };
    const wealthyLayout = buildLayout(wealthyTown);
    expect(wealthyLayout.cars).toHaveLength(2);
    expect(wealthyLayout.cars.map((car) => car.homeId).sort()).toEqual([10, 20]);
    expect(new Set(wealthyLayout.cars.map((car) => `${car.x},${car.z}`)).size).toBe(2);
    expect(wealthyLayout.cars).toEqual(buildLayout(wealthyTown).cars);
    expect(layoutSignature(wealthyLayout)).not.toBe(layoutSignature(layout));
    expect(wealthyLayout.cars.every((car) => wealthyTown.people.some((p) => p.id === car.residentId && p.money >= AFFLUENT_CAR_THRESHOLD))).toBe(true);
    for (const car of wealthyLayout.cars) {
      expect(wealthyLayout.roads.some((road) => road.axis === "x" && Math.abs(road.z - car.z) <= 0.051)).toBe(true);
      for (const building of [...wealthyLayout.houses, ...wealthyLayout.workplaces]) {
        const overlapsX = Math.abs(car.x - building.x) < 1.28 / 2 + building.w / 2;
        const overlapsZ = Math.abs(car.z - building.z) < 0.48 / 2 + building.d / 2;
        expect(overlapsX && overlapsZ).toBe(false);
      }
      for (const tree of wealthyLayout.trees) {
        const nearestX = Math.max(Math.abs(car.x - tree.x) - 1.28 / 2, 0);
        const nearestZ = Math.max(Math.abs(car.z - tree.z) - 0.48 / 2, 0);
        expect(Math.hypot(nearestX, nearestZ)).toBeGreaterThanOrEqual(tree.s * 0.5 - 0.001);
      }
      for (const fountain of wealthyLayout.fountains) {
        const nearestX = Math.max(Math.abs(car.x - fountain.x) - 1.28 / 2, 0);
        const nearestZ = Math.max(Math.abs(car.z - fountain.z) - 0.48 / 2, 0);
        expect(Math.hypot(nearestX, nearestZ)).toBeGreaterThanOrEqual(1.25 - 0.001);
      }
    }
  });
  it("pushes people out of walls", () => {
    const h = layout.houses[0]!;
    const out = pushOut(layout, h.x, h.z);
    expect(Math.abs(out.x - h.x) >= h.w / 2 || Math.abs(out.z - h.z) >= h.d / 2).toBe(true);
    expect(pushOut(layout, 0, 0)).toEqual({ x: 0, z: 0 });
  });
  it("reuses an optional output point when resolving collisions", () => {
    const h = layout.houses[0]!;
    const out = { x: 0, z: 0 };
    expect(pushOut(layout, h.x, h.z, out)).toBe(out);
    expect(Math.abs(out.x - h.x) >= h.w / 2 || Math.abs(out.z - h.z) >= h.d / 2).toBe(true);
  });
});
