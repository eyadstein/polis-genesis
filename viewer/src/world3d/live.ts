/** Talks to the living town: fetches what is new, and sends commands. */

import type { Town } from "../types";
import { ReplayPlayer, type Replay } from "./replay";

export const POLL_MS = 250;
export const TOWN_MS = 4000;
const FRAMES_PER_ASK = 500;

export interface LiveStatus {
  tick: number;
  paused: boolean;
  speed: number;
  alive: number;
}

interface Reply {
  seq: number;
  tick: number;
  paused: boolean;
  speed: number;
  alive: number;
  frames: { seq: number; tick: number; p: number[][] }[];
  talk: Replay["talk"];
  talk_total: number;
}

export type Fetcher = (url: string, body?: unknown) => Promise<unknown>;

/** Real network calls. A body means POST. */
export const networkFetcher: Fetcher = async (url, body) => {
  const response = await fetch(url, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // keep the raw text
    }
    throw new Error(message || `${url} returned ${response.status}`);
  }
  return JSON.parse(text);
};

export function emptyReplay(): Replay {
  return { version: 1, width: 64, height: 64, every: 1, actions: [], frames: [], talk: [] };
}

/**
 * How far to draw the living town. It stays a little behind the newest tick so
 * there is always a next frame to glide toward, and it never runs ahead of it.
 */
export function nextRenderTick(current: number, latest: number, speed: number, paused: boolean, seconds: number): number {
  if (paused) return latest;
  const lead = Math.max(1, speed * 0.5);
  if (current > latest || latest - current > lead + 4 + speed * 2) return Math.max(0, latest - lead);
  const ceiling = Math.max(latest - lead, current);
  return Math.min(current + speed * seconds, ceiling);
}

export class LiveFeed {
  readonly player = new ReplayPlayer(emptyReplay());
  status: LiveStatus = { tick: 0, paused: false, speed: 2, alive: 0 };
  private seq = 0;
  private talkTotal = 0;

  constructor(private readonly call: Fetcher = networkFetcher) {}

  private take(reply: Reply): void {
    this.status = { tick: reply.tick, paused: reply.paused, speed: reply.speed, alive: reply.alive };
  }

  /** Look at the town, then start from its last moments instead of its whole memory. */
  async connect(): Promise<void> {
    const peek = (await this.call("/api/frames?after=999999999999&talk=999999999999&limit=1")) as Reply;
    this.take(peek);
    this.seq = Math.max(0, peek.seq - 40);
    this.talkTotal = Math.max(0, peek.talk_total - 30);
    await this.poll();
  }

  /** Fetch what is new. Returns the frames that arrived, oldest first. */
  async poll(): Promise<{ tick: number; p: number[][] }[]> {
    const arrived: { tick: number; p: number[][] }[] = [];
    for (let round = 0; round < 8; round++) {
      const reply = (await this.call(`/api/frames?after=${this.seq}&talk=${this.talkTotal}&limit=${FRAMES_PER_ASK}`)) as Reply;
      if (reply.seq < this.seq || reply.talk_total < this.talkTotal) {
        // The town started over, so start over with it.
        this.seq = 0;
        this.talkTotal = 0;
        this.player.reset();
        arrived.length = 0;
        continue;
      }
      this.take(reply);
      const frames = reply.frames.map((f) => ({ tick: f.tick, p: f.p }));
      this.player.append(frames, reply.talk);
      arrived.push(...frames);
      const last = reply.frames[reply.frames.length - 1];
      if (last) this.seq = last.seq;
      this.talkTotal = reply.talk_total;
      if (reply.frames.length < FRAMES_PER_ASK) break;
    }
    return arrived;
  }

  async town(): Promise<Town> {
    return (await this.call("/api/town")) as Town;
  }

  async setClock(change: { paused?: boolean; speed?: number }): Promise<void> {
    const reply = (await this.call("/api/clock", change)) as { paused: boolean; speed: number };
    this.status = { ...this.status, paused: reply.paused, speed: reply.speed };
  }

  async addPeople(count: number): Promise<number[]> {
    const reply = (await this.call("/api/people", { count })) as { ids: number[] };
    return reply.ids;
  }
}
