import { describe, expect, it, vi } from "vitest";
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

function sampleTown(size: number): Town {
  const people: Person[] = Array.from({ length: size }, (_, id) => ({
    id,
    name: `Person ${id}`,
    alive: true,
    age: 5000,
    adult: true,
    generation: 0,
    money: 50,
    job: null,
    home: id % 208,
    home_kind: "House",
    home_district: (id % 208) % 16,
    rent: null,
    partner: null,
    parents: null,
    record: 0,
    jailed: false,
    friends: 0,
    mood: 0,
    hunger: 0.8,
    x: id % 64,
    y: Math.floor(id / 64) % 64,
    voice: null,
  }));
  return {
    version: 3,
    tick: 5000,
    width: 64,
    height: 64,
    stats: { alive: size },
    justice: { crimes: 0, convictions: 0, acquittals: 0, jailed: 0, treasury: 0 },
    history: [],
    districts: Array.from({ length: 16 }, (_, id) => ({ id, homes: 13, appeal: 0.5, occupancy: 0.5, neighbor_wealth: 0.5, mean_rent: 0 })),
    people,
    conversations: [],
  };
}

// Stub resize observation before constructing the scene in each benchmark test.
vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });

describe("WorldScene.update CPU benchmark (WebGL rendering stubbed)", () => {
  for (const size of [100, 1000, 3000]) {
    it(`${size} active residents`, () => {
      const town = sampleTown(size);
      const samples = town.people.map((p) => ({ id: p.id, x: p.x, y: p.y, action: 4, jailed: false }));
      const scene = new WorldScene(document.createElement("div"), buildLayout(town), town);
      const frames = 120;
      for (let i = 0; i < 60; i++) scene.update(5000, samples, 1 / 60);
      const perFrameMs = Array.from({ length: 9 }, () => {
        const start = performance.now();
        for (let i = 0; i < frames; i++) scene.update(5000, samples, 1 / 60);
        return (performance.now() - start) / frames;
      }).sort((a, b) => a - b);
      const median = perFrameMs[4] ?? 0;
      const slowestRunMean = perFrameMs[perFrameMs.length - 1] ?? 0;
      console.log(JSON.stringify({ residents: size, framesPerSample: frames, repetitions: perFrameMs.length, medianFrameMs: median, slowestRunMeanMs: slowestRunMean }));
      expect(scene.poseOf(0)).not.toBeNull();
    }, 15000);
  }
});
