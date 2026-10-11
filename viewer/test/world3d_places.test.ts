import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Person, Town } from "../src/types";
import { buildLayout, layoutSignature, residentsByFloor, workersOf } from "../src/world3d/layout";

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

const { WorldScene } = await import("../src/world3d/scene");

function person(id: number, home: number, district: number, job: string | null = null): Person {
  return {
    id, name: `P${id}`, alive: true, age: 9000, adult: true, generation: 0, money: 10, job,
    home, home_kind: "Flat", home_district: district, rent: 5, partner: null, parents: null, record: 0,
    jailed: false, friends: 0, mood: 0.5, hunger: 0.5, x: 0, y: 0, voice: null,
  };
}

const town: Town = {
  version: 2, tick: 100, width: 64, height: 64, stats: {},
  justice: { crimes: 0, convictions: 0, acquittals: 0, jailed: 0, treasury: 0 },
  history: [], conversations: [],
  districts: Array.from({ length: 16 }, (_, id) => ({ id, homes: 6, appeal: 0.5, occupancy: 0.5, neighbor_wealth: 0.5, mean_rent: 10 })),
  people: [1, 2, 3, 4].map((id) => person(id, 20, 5, "Farmer")),
};

describe("places", () => {
  const layout = buildLayout(town);

  it("names every district and gives each its own hue", () => {
    expect(layout.districts).toHaveLength(16);
    expect(new Set(layout.districts.map((d) => d.name)).size).toBe(16);
    expect(new Set(layout.districts.map((d) => d.hue.toFixed(3))).size).toBe(16);
  });

  it("puts residents on floors", () => {
    const flat = layout.homeOf.get(20)!;
    expect(residentsByFloor({ ...flat, occupants: [1, 2, 3, 4], floors: 3 })).toEqual([
      { floor: 1, people: [1, 4] },
      { floor: 2, people: [2] },
      { floor: 3, people: [3] },
    ]);
    expect(residentsByFloor({ ...flat, occupants: [], floors: 3 })).toEqual([]);
  });

  it("shares workers between the sites of a job", () => {
    const sites = layout.workplaces.filter((w) => w.job === "Farmer");
    expect(sites).toHaveLength(2);
    const a = workersOf(layout, town, sites[0]!).map((p) => p.id);
    const b = workersOf(layout, town, sites[1]!).map((p) => p.id);
    expect([...a, ...b].sort()).toEqual([1, 2, 3, 4]);
  });

  describe("in the scene", () => {
    beforeAll(() => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
    });

    it("selects buildings and homes, and clears them when a person is picked", () => {
      const scene = new WorldScene(document.createElement("div"), layout, town);
      let opened: string | null = null;
      scene.onBuilding = (b) => (opened = b ? b.type : null);
      scene.selectHome(20);
      expect(opened).toBe("house");
      expect(scene.selectedBuildingNow?.type).toBe("house");
      scene.update(10, [{ id: 1, x: 5, y: 5, action: 3, jailed: false }], 0.016);
      scene.select(1);
      expect(opened).toBeNull();
      expect(scene.selectedBuildingNow).toBeNull();
    });
  });
});
describe("a growing town in the scene", () => {
  const layout = buildLayout(town);

  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  });

  it("notices when the buildings change", () => {
    const same = layoutSignature(buildLayout(town));
    expect(same).toBe(layoutSignature(layout));
    const grown: Town = { ...town, people: [...town.people, person(9, 77, 5, "Villa")] };
    expect(layoutSignature(buildLayout(grown))).not.toBe(same);
  });

  it("takes in newcomers", () => {
    const scene = new WorldScene(document.createElement("div"), layout, town);
    scene.update(10, [{ id: 9, x: 5, y: 5, action: 3, jailed: false }], 0.016);
    expect(scene.poseOf(9)).toBeNull();
    scene.syncPeople({ ...town, people: [...town.people, person(9, 77, 5)] });
    scene.update(10, [{ id: 9, x: 5, y: 5, action: 3, jailed: false }], 0.016);
    expect(scene.poseOf(9)).not.toBeNull();
  });

  it("builds the town again with new houses and keeps the open building", () => {
    const scene = new WorldScene(document.createElement("div"), layout, town);
    scene.selectHome(20);
    const grown: Town = { ...town, people: [...town.people, person(9, 77, 5, "Villa")] };
    const bigger = buildLayout(grown);
    scene.rebuildPlaces(bigger);
    expect(scene.selectedBuildingNow?.type).toBe("house");
    scene.selectHome(77);
    expect(scene.selectedBuildingNow?.type).toBe("house");
    scene.update(10, [], 0.016);
  });

  it("closes the building card when its building is gone", () => {
    const scene = new WorldScene(document.createElement("div"), layout, town);
    let open: string | null = "x";
    scene.onBuilding = (b) => (open = b ? b.type : null);
    scene.selectHome(20);
    const empty: Town = { ...town, people: [], districts: town.districts.map((d) => ({ ...d, homes: 0 })) };
    scene.rebuildPlaces(buildLayout(empty));
    expect(open).toBeNull();
    expect(scene.selectedBuildingNow).toBeNull();
  });
});