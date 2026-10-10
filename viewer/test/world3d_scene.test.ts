import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Person, Town } from "../src/types";

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
const { buildLayout } = await import("../src/world3d/layout");

function person(id: number, home: number, district: number, parents: [number, number] | null = null): Person {
  return {
    id, name: `P${id}`, alive: true, age: 9000 + id, adult: true, generation: 0, money: 10, job: "Farmer",
    home, home_kind: "House", home_district: district, rent: 5, partner: null, parents, record: 0,
    jailed: false, friends: 0, mood: 0.5, hunger: 0.5, x: 0, y: 0, voice: null,
  };
}

const town: Town = {
  version: 2, tick: 200, width: 64, height: 64, stats: {},
  justice: { crimes: 0, convictions: 0, acquittals: 0, jailed: 0, treasury: 0 },
  history: [],
  districts: Array.from({ length: 16 }, (_, id) => ({ id, homes: 5, appeal: 0.5, occupancy: 0.5, neighbor_wealth: 0.5, mean_rent: 10 })),
  people: [person(1, 1, 0), person(2, 2, 0), person(3, 3, 1, [1, 2])],
  conversations: [],
};

describe("world scene", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  });

  it("draws day, night and moving people without errors", () => {
    const host = document.createElement("div");
    const scene = new WorldScene(host, buildLayout(town), town);
    const samples = [
      { id: 1, x: 10, y: 10, action: 3, jailed: false },
      { id: 2, x: 20, y: 20, action: 1, jailed: true },
    ];
    for (const tick of [0, 6, 12, 18, 23.5, 36]) scene.update(tick, samples, 0.016);
    expect(scene.poseOf(1)).not.toBeNull();
    expect(scene.poseOf(3)).toBeNull();
    scene.update(40, [{ id: 1, x: 11, y: 10, action: 3, jailed: false }], 0.016);
    expect(scene.poseOf(2)).toBeNull();
    expect(scene.poseOf(1)?.heading).toBeCloseTo(Math.PI / 2, 1);
  });

  it("selects and follows a person", () => {
    const scene = new WorldScene(document.createElement("div"), buildLayout(town), town);
    let picked: number | null = -1;
    scene.onSelect = (id) => (picked = id);
    scene.update(10, [{ id: 1, x: 40, y: 40, action: 3, jailed: false }], 0.016);
    scene.select(1);
    expect(picked).toBe(1);
    const before = scene.controls.target.x;
    for (let i = 0; i < 20; i++) scene.update(10, [{ id: 1, x: 40, y: 40, action: 3, jailed: false }], 0.016);
    expect(scene.controls.target.x).toBeGreaterThan(before);
    scene.select(null);
    expect(scene.selectedId).toBeNull();
  });
});
