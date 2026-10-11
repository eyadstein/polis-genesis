import { describe, expect, it, vi } from "vitest";
import { SimClock } from "../src/world3d/clock";
import { LiveFeed, nextRenderTick, type Fetcher } from "../src/world3d/live";
import { ReplayPlayer, type Replay } from "../src/world3d/replay";

function reply(seq: number, ticks: number[], extra: Record<string, unknown> = {}) {
  return {
    seq,
    tick: ticks[ticks.length - 1] ?? 0,
    paused: false,
    speed: 2,
    alive: 3,
    talk: [] as unknown[],
    talk_total: 0,
    frames: ticks.map((tick, i) => ({ seq: seq - ticks.length + 1 + i, tick, p: [[1, tick, 0, 3, 0]] })),
    ...extra,
  };
}

describe("append", () => {
  const base = (): Replay => ({ version: 1, width: 64, height: 64, every: 1, actions: [], frames: [], talk: [] });

  it("adds frames and speech", () => {
    const player = new ReplayPlayer(base());
    player.append([{ tick: 1, p: [[1, 0, 0, 3, 0]] }, { tick: 2, p: [[1, 2, 0, 3, 0]] }], [[2, 1, 1, "hi"]]);
    expect(player.endTick).toBe(2);
    expect(player.sample(1.5)[0]?.x).toBe(1);
    expect(player.talkBetween(0, 5)).toHaveLength(1);
  });

  it("lets a frame for the same tick replace the old one", () => {
    const player = new ReplayPlayer(base());
    player.append([{ tick: 1, p: [[1, 0, 0, 3, 0]] }], []);
    player.append([{ tick: 1, p: [[1, 0, 0, 3, 0], [2, 5, 5, 4, 0]] }], []);
    expect(player.replay.frames).toHaveLength(1);
    expect(player.sample(1).map((s) => s.id)).toEqual([1, 2]);
  });

  it("keeps only the recent past", () => {
    const player = new ReplayPlayer(base());
    const frames = Array.from({ length: 4100 }, (_, i) => ({ tick: i, p: [[1, 0, 0, 3, 0]] }));
    player.append(frames, []);
    expect(player.replay.frames).toHaveLength(4000);
    expect(player.startTick).toBe(100);
    expect(player.sample(150)).toHaveLength(1);
  });

  it("can be emptied", () => {
    const player = new ReplayPlayer(base());
    player.append([{ tick: 1, p: [[1, 0, 0, 3, 0]] }], [[1, 1, 1, "x"]]);
    player.reset();
    expect(player.replay.frames).toHaveLength(0);
    expect(player.sample(1)).toEqual([]);
  });
});

describe("render tick", () => {
  it("shows the newest tick while paused", () => {
    expect(nextRenderTick(3, 10, 2, true, 0.016)).toBe(10);
  });
  it("glides forward at the speed of the town and stays a little behind", () => {
    let t = 5;
    for (let i = 0; i < 100; i++) t = nextRenderTick(t, 10, 2, false, 0.1);
    expect(t).toBe(9);
  });
  it("never runs ahead of the town", () => {
    let t = 0;
    for (let i = 0; i < 1000; i++) t = nextRenderTick(t, 50, 4, false, 0.1);
    expect(t).toBeLessThanOrEqual(50);
  });
  it("jumps close when far behind or when the town started over", () => {
    expect(nextRenderTick(0, 500, 2, false, 0.016)).toBe(499);
    expect(nextRenderTick(900, 10, 2, false, 0.016)).toBe(9);
  });
  it("does not go backward after pausing", () => {
    expect(nextRenderTick(10, 10, 2, false, 0.016)).toBe(10);
  });
});

describe("live feed", () => {
  it("starts from the last moments, then follows along", async () => {
    const calls: string[] = [];
    const call: Fetcher = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("after=999999999999")) return reply(100, [], { talk_total: 60 });
      if (url.includes("after=60&talk=30")) return reply(100, [98, 99, 100], { talk_total: 62, talk: [[99, 1, 2, "hello"]] });
      return reply(100, [], { talk_total: 62 });
    });
    const feed = new LiveFeed(call);
    await feed.connect();
    expect(feed.player.endTick).toBe(100);
    expect(feed.player.talkBetween(0, 200)).toEqual([[99, 1, 2, "hello"]]);
    expect(feed.status.alive).toBe(3);
    expect(await feed.poll()).toEqual([]);
    expect(calls[calls.length - 1]).toContain("after=100&talk=62");
  });

  it("keeps asking while there is more", async () => {
    let round = 0;
    const call: Fetcher = async (url) => {
      if (url.includes("after=999999999999")) return reply(0, []);
      round++;
      const ticks = round === 1 ? Array.from({ length: 500 }, (_, i) => i + 1) : [501];
      const r = reply(round === 1 ? 500 : 501, ticks);
      return r;
    };
    const feed = new LiveFeed(call);
    await feed.connect();
    expect(feed.player.endTick).toBe(501);
  });

  it("starts over when the town does", async () => {
    let restarted = false;
    const call: Fetcher = async (url) => {
      if (url.includes("after=999999999999")) return reply(50, [49, 50], { talk_total: 5 });
      if (!restarted) {
        restarted = true;
        return reply(3, [1, 2, 3], { talk_total: 0 });
      }
      return reply(3, [1, 2, 3], { talk_total: 1 });
    };
    const feed = new LiveFeed(call);
    await feed.connect();
    expect(feed.player.endTick).toBe(3);
    expect(feed.player.startTick).toBe(1);
  });

  it("sends commands and remembers the answer", async () => {
    const sent: unknown[] = [];
    const call: Fetcher = async (url, body) => {
      sent.push([url, body]);
      if (url === "/api/clock") return { paused: true, speed: 8 };
      return { ids: [7, 8] };
    };
    const feed = new LiveFeed(call);
    await feed.setClock({ paused: true, speed: 8 });
    expect(feed.status).toMatchObject({ paused: true, speed: 8 });
    expect(await feed.addPeople(2)).toEqual([7, 8]);
    expect(sent[1]).toEqual(["/api/people", { count: 2 }]);
  });

  it("passes the server's complaint along", async () => {
    const feed = new LiveFeed(async () => {
      throw new Error("count must be between 1 and 100");
    });
    await expect(feed.addPeople(500)).rejects.toThrow("count must be");
  });
});

describe("range", () => {
  it("grows with the town", () => {
    const clock = new SimClock(0, 10, 10);
    clock.setRange(5, 20);
    clock.seek(30);
    expect(clock.tick).toBe(20);
    clock.seek(0);
    expect(clock.tick).toBe(5);
  });
});
