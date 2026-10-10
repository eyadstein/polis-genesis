/** Headlines found by comparing the people in one frame with the next. */

import { years } from "../stats";
import type { Town } from "../types";
import type { ReplayPlayer } from "./replay";

export interface NewsItem {
  tick: number;
  text: string;
  kind: "birth" | "death" | "prison" | "release";
  ids: number[];
}

export const QUIET_NEWS = "A quiet day in Polis.";

export function deriveNews(player: ReplayPlayer, town: Town): NewsItem[] {
  const names = new Map(town.people.map((p) => [p.id, p]));
  const name = (id: number): string => names.get(id)?.name ?? `Person ${id}`;
  const frames = player.replay.frames;
  const items: NewsItem[] = [];
  const rows = (i: number): Map<number, number[]> => new Map((frames[i]?.p ?? []).map((r) => [r[0] ?? -1, r]));
  let before = rows(0);
  for (let i = 1; i < frames.length; i++) {
    const tick = frames[i]?.tick ?? 0;
    const now = rows(i);
    for (const [id, row] of now) {
      const old = before.get(id);
      if (!old) {
        const parents = names.get(id)?.parents;
        items.push(
          parents
            ? { tick, kind: "birth", ids: [id, ...parents], text: `A baby was born: ${name(id)}, child of ${name(parents[0])} and ${name(parents[1])}.` }
            : { tick, kind: "birth", ids: [id], text: `${name(id)} arrived in town.` },
        );
      } else if (old[4] === 0 && row[4] === 1) {
        items.push({ tick, kind: "prison", ids: [id], text: `${name(id)} was sent to prison.` });
      } else if (old[4] === 1 && row[4] === 0) {
        items.push({ tick, kind: "release", ids: [id], text: `${name(id)} was released from prison.` });
      }
    }
    for (const id of before.keys()) {
      if (now.has(id)) continue;
      const person = names.get(id);
      const age = person ? years(Math.max(0, person.age - (town.tick - tick))) : null;
      items.push({ tick, kind: "death", ids: [id], text: `${name(id)} has died${age === null ? "" : ` at the age of ${age}`}.` });
    }
    before = now;
  }
  return items;
}

/** The newest headline from the last `window` ticks, or null on a quiet stretch. */
export function newsAt(items: NewsItem[], tick: number, window = 36): NewsItem | null {
  let found: NewsItem | null = null;
  for (const item of items) {
    if (item.tick > tick) break;
    if (item.tick > tick - window) found = item;
  }
  return found;
}
