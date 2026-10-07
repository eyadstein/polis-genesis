import type { Person, Town } from "./types";

/** One year of a person's life is 500 ticks. */
export const TICKS_PER_YEAR = 500;

export function years(age: number): number {
  return Math.floor(age / TICKS_PER_YEAR);
}

/** 0 is perfectly equal, 1 is one person holding everything. */
export function gini(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const n = sorted.length;
  if (n === 0 || total <= 0) return 0;
  const weighted = sorted.reduce((sum, v, i) => sum + (i + 1) * v, 0);
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

export interface Bucket {
  label: string;
  from: number;
  to: number;
  count: number;
}

const EDGES = [0, 1, 5, 20, 50, 100, 200, 400, 800, 1600];

/** How many people hold how much, in buckets that grow by roughly doubling. */
export function wealthBuckets(people: Person[]): Bucket[] {
  const buckets: Bucket[] = EDGES.map((from, i) => {
    const to = EDGES[i + 1] ?? Infinity;
    const label = to === Infinity ? `${from}+` : i === 0 ? "0" : `${from} to ${to - 1}`;
    return { label, from, to, count: 0 };
  });
  for (const person of people) {
    const bucket = buckets.find((b) => person.money >= b.from && person.money < b.to);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export function living(town: Town): Person[] {
  return town.people.filter((p) => p.alive);
}

export function personById(town: Town, id: number | null): Person | undefined {
  return id === null ? undefined : town.people[id];
}

export function childrenOf(town: Town, id: number): Person[] {
  return town.people.filter((p) => p.parents !== null && (p.parents[0] === id || p.parents[1] === id));
}

export interface Family {
  parents: Person[];
  partner: Person | undefined;
  children: Person[];
  siblings: Person[];
}

export function familyOf(town: Town, id: number): Family {
  const person = town.people[id];
  if (!person) return { parents: [], partner: undefined, children: [], siblings: [] };
  const parents = (person.parents ?? [])
    .map((p) => town.people[p])
    .filter((p): p is Person => p !== undefined);
  const siblings = town.people.filter(
    (p) =>
      p.id !== id &&
      p.parents !== null &&
      person.parents !== null &&
      (p.parents[0] === person.parents[0] || p.parents[1] === person.parents[1] ||
        p.parents[0] === person.parents[1] || p.parents[1] === person.parents[0]),
  );
  return {
    parents,
    partner: personById(town, person.partner),
    children: childrenOf(town, id),
    siblings,
  };
}

export interface Filter {
  query: string;
  aliveOnly: boolean;
  job: string;
  homelessOnly: boolean;
  recordOnly: boolean;
}

export const NO_FILTER: Filter = {
  query: "",
  aliveOnly: true,
  job: "",
  homelessOnly: false,
  recordOnly: false,
};

export function filterPeople(people: Person[], filter: Filter): Person[] {
  const query = filter.query.trim().toLowerCase();
  return people.filter((p) => {
    if (filter.aliveOnly && !p.alive) return false;
    if (query && !p.name.toLowerCase().includes(query)) return false;
    if (filter.job === "none" && p.job !== null) return false;
    if (filter.job && filter.job !== "none" && p.job !== filter.job) return false;
    if (filter.homelessOnly && p.home !== null) return false;
    if (filter.recordOnly && p.record === 0) return false;
    return true;
  });
}

export type SortKey = "name" | "age" | "money" | "friends" | "generation" | "mood";

export function sortPeople(people: Person[], key: SortKey, descending: boolean): Person[] {
  const direction = descending ? -1 : 1;
  return [...people].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const order =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return order !== 0 ? direction * order : a.id - b.id;
  });
}

export function jobsIn(town: Town): string[] {
  return [...new Set(town.people.map((p) => p.job).filter((j): j is string => j !== null))].sort();
}

export function moodWord(mood: number): string {
  if (mood > 0.4) return "happy";
  if (mood > 0.1) return "content";
  if (mood > -0.2) return "uneasy";
  return "low";
}
