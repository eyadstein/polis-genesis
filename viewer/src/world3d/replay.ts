/** Reads replay.json and answers "where is everyone at tick t". */

export type ReplayTalk = [tick: number, speaker: number, listener: number, text: string];

export interface Replay {
  version: number;
  width: number;
  height: number;
  every: number;
  actions: string[];
  frames: { tick: number; p: number[][] }[];
  talk: ReplayTalk[];
}

export interface Sample {
  id: number;
  x: number;
  y: number;
  action: number;
  jailed: boolean;
}

export const REPLAY_VERSION = 1;

/** How much of a living town the viewer keeps in memory. */
export const LIVE_FRAME_LIMIT = 4000;
export const LIVE_TALK_LIMIT = 20_000;

export function parseReplay(raw: unknown): Replay {
  const r = raw as Partial<Replay> | null;
  if (!r || typeof r !== "object") throw new Error("replay.json is not an object");
  if (r.version !== REPLAY_VERSION) throw new Error(`replay version ${String(r.version)} is not supported`);
  if (!Array.isArray(r.frames) || r.frames.length === 0) throw new Error("replay has no frames");
  if (!Array.isArray(r.talk) || !Array.isArray(r.actions)) throw new Error("replay is incomplete");
  if (typeof r.width !== "number" || typeof r.height !== "number") throw new Error("replay has no size");
  return r as Replay;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class ReplayPlayer {
  private readonly rows: Map<number, number[]>[];

  constructor(readonly replay: Replay) {
    this.rows = replay.frames.map((f) => new Map(f.p.map((row) => [row[0] ?? -1, row])));
  }

  /**
   * Add frames and speech from the living town. A frame with the same tick as
   * the newest one replaces it, which is how newcomers show up while paused.
   */
  append(frames: Replay["frames"], talk: ReplayTalk[]): void {
    const kept = this.replay.frames;
    for (const frame of frames) {
      if (kept[kept.length - 1]?.tick === frame.tick) {
        kept.pop();
        this.rows.pop();
      }
      kept.push({ tick: frame.tick, p: frame.p });
      this.rows.push(new Map(frame.p.map((row) => [row[0] ?? -1, row])));
    }
    if (kept.length > LIVE_FRAME_LIMIT) {
      const extra = kept.length - LIVE_FRAME_LIMIT;
      kept.splice(0, extra);
      this.rows.splice(0, extra);
    }
    for (const line of talk) this.replay.talk.push(line);
    if (this.replay.talk.length > LIVE_TALK_LIMIT) {
      this.replay.talk.splice(0, this.replay.talk.length - LIVE_TALK_LIMIT);
    }
  }

  /** Forget everything, for when the town starts over. */
  reset(): void {
    this.replay.frames.length = 0;
    this.replay.talk.length = 0;
    this.rows.length = 0;
  }

  get startTick(): number {
    return this.replay.frames[0]?.tick ?? 0;
  }

  get endTick(): number {
    return this.replay.frames[this.replay.frames.length - 1]?.tick ?? 0;
  }

  /** Index of the last frame at or before the tick. */
  frameIndex(tick: number): number {
    const frames = this.replay.frames;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((frames[mid]?.tick ?? 0) <= tick) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Everyone alive at the tick, smoothly placed between two frames. */
  sample(tick: number): Sample[] {
    const i = this.frameIndex(tick);
    const a = this.replay.frames[i];
    const rowsA = this.rows[i];
    if (!a || !rowsA) return [];
    const b = this.replay.frames[i + 1];
    const rowsB = this.rows[i + 1];
    const t = b ? Math.min(1, Math.max(0, (tick - a.tick) / (b.tick - a.tick))) : 0;
    const out: Sample[] = [];
    for (const [id, row] of rowsA) {
      const next = rowsB?.get(id);
      out.push({
        id,
        x: lerp(row[1] ?? 0, next ? (next[1] ?? 0) : (row[1] ?? 0), t),
        y: lerp(row[2] ?? 0, next ? (next[2] ?? 0) : (row[2] ?? 0), t),
        action: row[3] ?? 4,
        jailed: row[4] === 1,
      });
    }
    if (rowsB && t >= 0.5) {
      for (const [id, row] of rowsB) {
        if (!rowsA.has(id)) out.push({ id, x: row[1] ?? 0, y: row[2] ?? 0, action: row[3] ?? 4, jailed: row[4] === 1 });
      }
    }
    return out;
  }

  /** Lines spoken in the half open window (from, to]. */
  talkBetween(from: number, to: number): ReplayTalk[] {
    const talk = this.replay.talk;
    const firstAfter = (tick: number): number => {
      let lo = 0;
      let hi = talk.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((talk[mid]?.[0] ?? 0) <= tick) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    return talk.slice(firstAfter(from), firstAfter(to));
  }
}
