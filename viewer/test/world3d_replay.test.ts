import { describe, expect, it } from "vitest";
import { ReplayPlayer, parseReplay, type Replay } from "../src/world3d/replay";

const replay: Replay = {
  version: 1,
  width: 64,
  height: 64,
  every: 10,
  actions: ["Eat", "Rest", "Socialize", "Work", "Wander"],
  frames: [
    { tick: 10, p: [[1, 0, 0, 3, 0], [2, 10, 10, 1, 0]] },
    { tick: 20, p: [[1, 10, 20, 3, 0], [3, 5, 5, 4, 1]] },
    { tick: 30, p: [[1, 10, 20, 0, 0], [3, 5, 5, 4, 1]] },
  ],
  talk: [[12, 1, 2, "hello"], [25, 2, 1, "hi"]],
};

describe("replay", () => {
  const player = new ReplayPlayer(replay);
  it("knows its range", () => {
    expect(player.startTick).toBe(10);
    expect(player.endTick).toBe(30);
  });
  it("finds frames", () => {
    expect(player.frameIndex(5)).toBe(0);
    expect(player.frameIndex(10)).toBe(0);
    expect(player.frameIndex(19.9)).toBe(0);
    expect(player.frameIndex(20)).toBe(1);
    expect(player.frameIndex(99)).toBe(2);
  });
  it("glides between frames", () => {
    const s = player.sample(15).find((p) => p.id === 1);
    expect(s).toMatchObject({ x: 5, y: 10, action: 3 });
  });
  it("shows the dead until they leave and the born when they arrive", () => {
    expect(player.sample(12).map((p) => p.id).sort()).toEqual([1, 2]);
    expect(player.sample(16).map((p) => p.id).sort()).toEqual([1, 2, 3]);
    expect(player.sample(25).find((p) => p.id === 3)?.jailed).toBe(true);
  });
  it("lists speech in a window", () => {
    expect(player.talkBetween(10, 20)).toEqual([[12, 1, 2, "hello"]]);
    expect(player.talkBetween(0, 100)).toHaveLength(2);
  });
  it("rejects bad files", () => {
    expect(() => parseReplay(null)).toThrow();
    expect(() => parseReplay({ version: 9 })).toThrow();
    expect(parseReplay(replay).frames).toHaveLength(3);
  });
});
