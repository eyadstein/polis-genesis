import { describe, expect, it } from "vitest";
import { ADULT_HEIGHT, FLOORS, FLOOR_HEIGHT, LAMP_HEIGHT, PERSON_SCALE, TREE_HEIGHT } from "../src/world3d/scale";

describe("real world proportions", () => {
  it("keeps people smaller than a house storey and much smaller than a tree", () => {
    expect(ADULT_HEIGHT).toBeCloseTo(0.45);
    expect(ADULT_HEIGHT).toBeLessThan(FLOOR_HEIGHT.House);
    expect(ADULT_HEIGHT).toBeLessThan(TREE_HEIGHT / 4);
    expect(PERSON_SCALE).toBeGreaterThan(0.3);
    expect(PERSON_SCALE).toBeLessThan(0.5);
  });

  it("gives every home a storey between 0.6 and 1.5 units, and flats four floors", () => {
    for (const h of Object.values(FLOOR_HEIGHT)) {
      expect(h).toBeGreaterThanOrEqual(0.6);
      expect(h).toBeLessThanOrEqual(1.5);
    }
    expect(FLOORS.Flat).toBe(4);
    expect(LAMP_HEIGHT).toBe(1.4);
  });
});
