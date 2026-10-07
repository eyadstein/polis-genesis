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
  mood: number;
  hunger: number;
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

export const FORMAT_VERSION = 2;
