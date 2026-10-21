export interface Person {
  id: number;
  name: string;
  alive: boolean;
  age: number;
  adult: boolean;
  generation: number;
  money: number;
  job: string | null;
  home: number | null;
  home_kind: string | null;
  home_district: number | null;
  rent: number | null;
  partner: number | null;
  parents: [number, number] | null;
  record: number;
  jailed: boolean;
  friends: number;
  /** What this person has learned about treating people. Missing in older town files. */
  mind?: Mind | null;
  mood: number;
  hunger: number;
  thirst?: number;
  x: number;
  y: number;
  voice: string | null;
}

export interface HistoryPoint {
  tick: number;
  alive: number;
  children: number;
  couples: number;
  gini: number;
  employed: number;
  homeless: number;
  vacant: number;
  mean_money: number;
  mean_rent: number;
  /** Added in town format 3; absent from older snapshots. */
  food_stock?: number;
  crimes: number;
  convictions: number;
  treasury: number;
}

export interface District {
  id: number;
  homes: number;
  appeal: number;
  occupancy: number;
  neighbor_wealth: number;
  mean_rent: number;
}

export interface Conversation {
  tick: number;
  speaker: number;
  listener: number;
  act: string;
  about: number | null;
  text: string;
}

export interface Justice {
  crimes: number;
  convictions: number;
  acquittals: number;
  jailed: number;
  treasury: number;
}

export interface Town {
  version: number;
  /** Present in town format 3; omitted by earlier exports. */
  run?: RunMetadata;
  tick: number;
  width: number;
  height: number;
  stats: Record<string, number>;
  justice: Justice;
  history: HistoryPoint[];
  districts: District[];
  people: Person[];
  conversations: Conversation[];
}

export interface RunMetadata {
  /** Decimal string preserves the full unsigned 64-bit seed exactly. */
  seed: string;
  initial_population: number;
  width: number;
  height: number;
}

export const FORMAT_VERSION = 3;
export const SUPPORTED_FORMAT_VERSIONS = [2, FORMAT_VERSION] as const;

/** Shares from 0 to 1 of how someone treats the people they know. */
export interface Mind {
  experience: number;
  greets_back: number;
  ignores: number;
  quarrels: number;
}
