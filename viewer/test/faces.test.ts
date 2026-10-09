import { describe, expect, it } from "vitest";
import { faceFor, faceSvg, type Face } from "../src/faces";

const lineage = new Map([
  [1, { id: 1, parents: null as [number, number] | null }],
  [2, { id: 2, parents: null as [number, number] | null }],
  [3, { id: 3, parents: [1, 2] as [number, number] | null }],
]);

describe("faces", () => {
  it("is deterministic", () => {
    expect(faceFor(1, lineage)).toEqual(faceFor(1, lineage));
  });
  it("gives different people different faces", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(JSON.stringify(faceFor(i + 1000, new Map())));
    expect(seen.size).toBe(200);
  });
  it("children sit between their parents", () => {
    const a = faceFor(1, lineage);
    const b = faceFor(2, lineage);
    const c = faceFor(3, lineage);
    const lo = Math.min(a.skin, b.skin) - 0.06;
    const hi = Math.max(a.skin, b.skin) + 0.06;
    expect(c.skin).toBeGreaterThanOrEqual(lo);
    expect(c.skin).toBeLessThanOrEqual(hi);
    expect([a.hair, b.hair]).toContain(c.hair);
    expect([a.eyes, b.eyes]).toContain(c.eyes);
  });
  it("renders svg", () => {
    const f: Face = faceFor(3, lineage);
    expect(faceSvg(f, 48, 10)).toContain("<svg");
  });
});