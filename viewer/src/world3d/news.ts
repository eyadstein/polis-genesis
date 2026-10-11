/** Headlines found by comparing the people in one frame with the next. */

import { years } from "../stats";
import type { Town } from "../types";
import type { ReplayPlayer } from "./replay";

export interface NewsItem {
  tick: number;
  kind: "birth" | "death" | "prison" | "release";
  ids: number[];
}

export const QUIET_NEWS = "A quiet day in Polis.";
const KEEP_ITEMS = 500;

type Rows = Map<number, number[]>;

/** Reads frames one after another and keeps the headlines. Safe to feed the same tick twice. */
export class NewsFeed {
  readonly items: NewsItem[] = [];
  private before: Rows = new Map();
  private current: Rows = new Map();
  private tick = -1;
  private hasBefore = false;
  private told = new Set<string>();

  private tell(item: NewsItem): void {
    const key = `${item.kind}:${item.ids[0]}`;
    if (this.told.has(key)) return;
    this.told.add(key);
    this.items.push(item);
    if (this.items.length > KEEP_ITEMS) this.items.splice(0, this.items.length - KEEP_ITEMS);
  }

  push(frame: { tick: number; p: number[][] }): void {
    const rows: Rows = new Map(frame.p.map((r) => [r[0] ?? -1, r]));
    if (frame.tick < this.tick) {
      this.items.length = 0;
      this.tick = -1;
      this.hasBefore = false;
    }
    if (this.tick < 0) {
      this.current = rows;
      this.tick = frame.tick;
      return;
    }
    if (frame.tick > this.tick) {
      this.before = this.current;
      this.hasBefore = true;
      this.told.clear();
      this.tick = frame.tick;
    }
    if (this.hasBefore) this.compare(frame.tick, rows);
    this.current = rows;
  }

  private compare(tick: number, now: Rows): void {
    for (const [id, row] of now) {
      const old = this.before.get(id);
      if (!old) this.tell({ tick, kind: "birth", ids: [id] });
      else if (old[4] === 0 && row[4] === 1) this.tell({ tick, kind: "prison", ids: [id] });
      else if (old[4] === 1 && row[4] === 0) this.tell({ tick, kind: "release", ids: [id] });
    }
    for (const id of this.before.keys()) {
      if (!now.has(id)) this.tell({ tick, kind: "death", ids: [id] });
    }
  }
}

export function deriveNews(player: ReplayPlayer): NewsItem[] {
  const feed = new NewsFeed();
  for (const frame of player.replay.frames) feed.push(frame);
  return feed.items;
}

/** The words for a headline, using whatever the town knows now. */
export function describe(item: NewsItem, town: Town): string {
  const people = new Map(town.people.map((p) => [p.id, p]));
  const name = (id: number): string => people.get(id)?.name ?? `Person ${id}`;
  const id = item.ids[0] ?? -1;
  const person = people.get(id);
  switch (item.kind) {
    case "birth": {
      const parents = person?.parents;
      return parents
        ? `A baby was born: ${name(id)}, child of ${name(parents[0])} and ${name(parents[1])}.`
        : `${name(id)} arrived in town.`;
    }
    case "death": {
      const age = person ? years(Math.max(0, person.age - (town.tick - item.tick))) : null;
      return `${name(id)} has died${age === null ? "" : ` at the age of ${age}`}.`;
    }
    case "prison":
      return `${name(id)} was sent to prison.`;
    case "release":
      return `${name(id)} was released from prison.`;
  }
}

/** The newest headline from the last `window` ticks, or null on a quiet stretch. */
export function newsAt(items: NewsItem[], tick: number, window = 36): NewsItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as NewsItem;
    if (item.tick > tick) continue;
    return item.tick > tick - window ? item : null;
  }
  return null;
}
