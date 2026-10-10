/** Turns a town into places: districts, house plots, workplaces, parks and lamps. */

import type { Person, Town } from "../types";

export const DISTRICTS_PER_SIDE = 4;
const SLOTS_PER_SIDE = 4;

export type Kind = "Shack" | "Flat" | "House" | "Villa";

export interface House {
  id: number | null; // home id in the simulation, null for a vacant extra
  district: number;
  kind: Kind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  floors: number;
  occupants: number[];
}

export interface Workplace {
  job: string;
  title: string;
  district: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

export interface Tree {
  x: number;
  z: number;
  s: number;
}

export interface Lamp {
  x: number;
  z: number;
}

export type Building = ({ type: "house" } & House) | ({ type: "work" } & Workplace);

export interface DistrictPlot {
  id: number;
  name: string;
  x: number;
  z: number;
  size: number;
  hue: number;
}

export interface Layout {
  width: number;
  depth: number;
  slot: number;
  houses: House[];
  workplaces: Workplace[];
  trees: Tree[];
  lamps: Lamp[];
  districts: DistrictPlot[];
  /** Every plot of ground and what it is used for. */
  lots: { x: number; z: number; use: "house" | "work" | "park" }[];
  homeOf: Map<number, House>;
}

export const JOB_STYLE: Record<string, { color: string; h: number; w: number }> = {
  Farmer: { color: "#c9a24a", h: 1.3, w: 3.4 },
  Builder: { color: "#d98c3a", h: 1.7, w: 3 },
  Mechanic: { color: "#4a7fb5", h: 1.6, w: 3.2 },
  Shopkeeper: { color: "#c25a7a", h: 1.9, w: 3 },
  Officer: { color: "#3a4c8a", h: 2.2, w: 3 },
  Judge: { color: "#d8d4c4", h: 2.8, w: 3.4 },
  Lawyer: { color: "#6a5a8a", h: 2.4, w: 2.8 },
};

const JOB_ORDER = Object.keys(JOB_STYLE);

export const WORK_TITLES: Record<string, string> = {
  Farmer: "Farm",
  Builder: "Builders yard",
  Mechanic: "Garage",
  Shopkeeper: "Shop",
  Officer: "Police station",
  Judge: "Courthouse",
  Lawyer: "Law office",
};

export const DISTRICT_NAMES = [
  "Old Town", "Market Square", "Riverside", "Hilltop",
  "Garden Quarter", "Station Road", "Mill Lane", "Sunset Heights",
  "Fountain Park", "Harbor Row", "Cedar Grove", "Stonebridge",
  "Lantern Court", "Orchard End", "Crown Heights", "Southgate",
];

const KIND_SHAPE: Record<Kind, { w: number; h: number; floors: number }> = {
  Shack: { w: 1.9, h: 1.0, floors: 1 },
  House: { w: 2.5, h: 1.5, floors: 1 },
  Villa: { w: 3.1, h: 2.1, floors: 2 },
  Flat: { w: 3, h: 3.3, floors: 3 },
};

export function hash01(a: number, b: number): number {
  let h = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function asKind(value: string | null): Kind {
  return value === "Shack" || value === "Flat" || value === "Villa" ? value : "House";
}

/** Slot order inside a district, shuffled but repeatable. */
function slotOrder(district: number): number[] {
  const slots = Array.from({ length: SLOTS_PER_SIDE * SLOTS_PER_SIDE }, (_, i) => i);
  return slots
    .map((s) => ({ s, k: hash01(district, s) }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.s);
}

export function buildLayout(town: Town): Layout {
  const side = town.width / DISTRICTS_PER_SIDE;
  const slot = side / SLOTS_PER_SIDE;
  const houses: House[] = [];
  const workplaces: Workplace[] = [];
  const trees: Tree[] = [];
  const lots: Layout["lots"] = [];
  const homeOf = new Map<number, House>();
  const free = new Map<number, { x: number; z: number }[]>();

  for (let d = 0; d < DISTRICTS_PER_SIDE * DISTRICTS_PER_SIDE; d++) {
    const ox = (d % DISTRICTS_PER_SIDE) * side;
    const oz = Math.floor(d / DISTRICTS_PER_SIDE) * side;
    const district = town.districts.find((x) => x.id === d);
    const residents = town.people.filter((p) => p.home_district === d && p.home !== null);
    const known = new Map<number, { kind: Kind; people: number[] }>();
    for (const p of residents) {
      const entry = known.get(p.home as number) ?? { kind: asKind(p.home_kind), people: [] };
      entry.people.push(p.id);
      known.set(p.home as number, entry);
    }
    const wanted = Math.min(Math.max(district?.homes ?? 0, known.size), 13);
    const homes: { id: number | null; kind: Kind; people: number[] }[] = [...known.entries()]
      .slice(0, wanted)
      .map(([id, e]) => ({ id, kind: e.kind, people: e.people }));
    while (homes.length < wanted) homes.push({ id: null, kind: "House", people: [] });

    const order = slotOrder(d);
    const spots = order.map((s) => ({
      x: ox + ((s % SLOTS_PER_SIDE) + 0.5) * slot,
      z: oz + (Math.floor(s / SLOTS_PER_SIDE) + 0.5) * slot,
    }));
    homes.forEach((home, i) => {
      const spot = spots[i];
      if (!spot) return;
      const shape = KIND_SHAPE[home.kind];
      const jitter = 0.85 + hash01(d * 100 + i, 3) * 0.3;
      const house: House = {
        id: home.id,
        district: d,
        kind: home.kind,
        x: spot.x,
        z: spot.z,
        w: shape.w,
        d: shape.w * (0.85 + hash01(d * 100 + i, 5) * 0.25),
        h: shape.h * (home.kind === "Flat" ? 1 : jitter),
        floors: shape.floors,
        occupants: home.people,
      };
      houses.push(house);
      lots.push({ x: spot.x, z: spot.z, use: "house" });
      if (home.id !== null) homeOf.set(home.id, house);
    });
    free.set(d, spots.slice(homes.length));
  }

  JOB_ORDER.forEach((job, j) => {
    for (let k = 0; k < 2; k++) {
      const d = (j * 5 + k * 7) % (DISTRICTS_PER_SIDE * DISTRICTS_PER_SIDE);
      const spot = free.get(d)?.shift();
      if (!spot) continue;
      const style = JOB_STYLE[job] ?? { color: "#999999", h: 2, w: 3 };
      workplaces.push({ job, title: WORK_TITLES[job] ?? job, district: d, x: spot.x, z: spot.z, w: style.w, d: style.w * 0.9, h: style.h, color: style.color });
      lots.push({ x: spot.x, z: spot.z, use: "work" });
    }
  });

  for (const [d, spots] of free) {
    spots.forEach((spot, i) => {
      lots.push({ x: spot.x, z: spot.z, use: "park" });
      const count = 1 + Math.floor(hash01(d, i + 40) * 3);
      for (let t = 0; t < count; t++) {
        trees.push({
          x: spot.x + (hash01(d * 31 + i, t + 1) - 0.5) * slot * 0.7,
          z: spot.z + (hash01(d * 31 + i, t + 9) - 0.5) * slot * 0.7,
          s: 0.8 + hash01(d + i, t + 20) * 0.6,
        });
      }
    });
  }

  const lamps: Lamp[] = [];
  for (let x = 0; x <= town.width; x += slot * 2) {
    for (let z = 0; z <= town.height; z += slot * 2) lamps.push({ x, z });
  }

  const districts: DistrictPlot[] = Array.from({ length: DISTRICTS_PER_SIDE * DISTRICTS_PER_SIDE }, (_, id) => ({
    id,
    name: DISTRICT_NAMES[id] ?? `District ${id}`,
    x: (id % DISTRICTS_PER_SIDE) * side,
    z: Math.floor(id / DISTRICTS_PER_SIDE) * side,
    size: side,
    hue: (id * 0.137) % 1,
  }));

  return { width: town.width, depth: town.height, slot, houses, workplaces, trees, lamps, districts, lots, homeOf };
}

/** Moves a point out of any building so people walk on the roads. */
export function pushOut(layout: Layout, x: number, z: number): { x: number; z: number } {
  const margin = 0.3;
  const boxes = [...layout.houses, ...layout.workplaces];
  for (const b of boxes) {
    const hw = b.w / 2 + margin;
    const hd = b.d / 2 + margin;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx);
      const pz = hd - Math.abs(dz);
      return px < pz ? { x: b.x + Math.sign(dx || 1) * hw, z } : { x, z: b.z + Math.sign(dz || 1) * hd };
    }
  }
  return { x, z };
}

/** Residents of a house split over its floors, lowest floor first. */
export function residentsByFloor(house: House): { floor: number; people: number[] }[] {
  const floors = Math.max(1, house.floors);
  const out = Array.from({ length: floors }, (_, i) => ({ floor: i + 1, people: [] as number[] }));
  house.occupants.forEach((id, i) => out[i % floors]?.people.push(id));
  return out.filter((f) => f.people.length > 0);
}

/** People who hold this workplace's job, shared out between the sites for that job. */
export function workersOf(layout: Layout, town: Town, site: Workplace): Person[] {
  const sites = layout.workplaces.filter((w) => w.job === site.job);
  const mine = sites.indexOf(site);
  return town.people.filter((p) => p.alive && p.job === site.job).filter((_, i) => i % Math.max(1, sites.length) === mine);
}