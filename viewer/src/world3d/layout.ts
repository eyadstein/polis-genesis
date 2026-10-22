/** Turns a town into places: districts, house plots, workplaces, parks and lamps. */

import type { Person, Town } from "../types";
import { FLOORS, FLOOR_HEIGHT } from "./scale";

export const DISTRICTS_PER_SIDE = 4;
export const FOUNTAIN_PLAZA_CLEARANCE = 1.65;
export const FOUNTAIN_PLAZA_SIZE = 3;
const ROAD_WIDTH = 0.58;
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
  type: "conifer" | "deciduous";
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

export interface Fountain {
  district: number;
  x: number;
  z: number;
}

export interface Road {
  axis: "x" | "z";
  x: number;
  z: number;
  width: number;
  length: number;
}

export interface Bridge {
  x: number;
  z: number;
  length: number;
  width: number;
}

export interface Car {
  homeId: number;
  residentId: number;
  x: number;
  z: number;
  color: string;
}

export interface Waterfront {
  beach: { x: number; z: number; width: number; length: number };
  promenade: { x: number; z: number; width: number; length: number };
}

export interface Mountain {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface Castle {
  x: number;
  z: number;
  elevation: number;
}

/** Visual-only vehicle ownership marker based on the exported resident balance. */
export const AFFLUENT_CAR_THRESHOLD = 250;

export interface Layout {
  width: number;
  depth: number;
  slot: number;
  houses: House[];
  workplaces: Workplace[];
  trees: Tree[];
  lamps: Lamp[];
  fountains: Fountain[];
  roads: Road[];
  bridges: Bridge[];
  cars: Car[];
  waterfront: Waterfront;
  mountains: Mountain[];
  castle: Castle;
  districts: DistrictPlot[];
  /** Every plot of ground and what it is used for. */
  lots: { x: number; z: number; use: "house" | "work" | "park" }[];
  homeOf: Map<number, House>;
}

export const JOB_STYLE: Record<string, { color: string; h: number; w: number }> = {
  Farmer: { color: "#c9a24a", h: 0.9, w: 3.4 },
  Builder: { color: "#d98c3a", h: 1.0, w: 3 },
  Mechanic: { color: "#4a7fb5", h: 0.9, w: 3.2 },
  Shopkeeper: { color: "#c25a7a", h: 1.1, w: 3 },
  Officer: { color: "#3a4c8a", h: 1.5, w: 3 },
  Judge: { color: "#d8d4c4", h: 2.0, w: 3.4 },
  Lawyer: { color: "#6a5a8a", h: 1.6, w: 2.8 },
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

const CAR_COLORS = ["#9b3438", "#2f5d83", "#3d5948", "#d0c9b6", "#292e39"];

export const DISTRICT_NAMES = [
  "Old Town", "Market Square", "Riverside", "Hilltop",
  "Garden Quarter", "Station Road", "Mill Lane", "Sunset Heights",
  "Fountain Park", "Harbor Row", "Cedar Grove", "Stonebridge",
  "Lantern Court", "Orchard End", "Crown Heights", "Southgate",
];

const KIND_SHAPE: Record<Kind, { w: number; h: number; floors: number }> = {
  Shack: { w: 1.9, h: FLOOR_HEIGHT.Shack * FLOORS.Shack, floors: FLOORS.Shack },
  House: { w: 2.5, h: FLOOR_HEIGHT.House * FLOORS.House, floors: FLOORS.House },
  Villa: { w: 3.1, h: FLOOR_HEIGHT.Villa * FLOORS.Villa, floors: FLOORS.Villa },
  Flat: { w: 3, h: FLOOR_HEIGHT.Flat * FLOORS.Flat, floors: FLOORS.Flat },
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
        d: Math.min(shape.w * (0.85 + hash01(d * 100 + i, 5) * 0.25), slot - ROAD_WIDTH - (home.kind === "Flat" ? 0.45 : 0.08)),
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

  const fountains: Fountain[] = [];
  for (const [d, spots] of free) {
    if (spots.length === 0) continue;
    const districtX = (d % DISTRICTS_PER_SIDE) * side;
    const districtZ = Math.floor(d / DISTRICTS_PER_SIDE) * side;
    const centerX = districtX + side / 2;
    const centerZ = districtZ + side / 2;
    let fountainIndex = 0;
    for (let i = 1; i < spots.length; i++) {
      const candidate = spots[i]!;
      const best = spots[fountainIndex]!;
      if (Math.hypot(candidate.x - centerX, candidate.z - centerZ) < Math.hypot(best.x - centerX, best.z - centerZ)) fountainIndex = i;
    }
    const [spot] = spots.splice(fountainIndex, 1);
    if (spot) {
      lots.push({ x: spot.x, z: spot.z, use: "park" });
      fountains.push({ district: d, x: spot.x, z: spot.z });
    }
  }

  for (const spots of free.values()) {
    spots.forEach((spot) => {
      lots.push({ x: spot.x, z: spot.z, use: "park" });
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

  const roads: Road[] = [];
  const plazaClearance = FOUNTAIN_PLAZA_CLEARANCE;
  const addRoad = (axis: Road["axis"], x: number, z: number, length: number): void => {
    const lineStart = (axis === "x" ? x : z) - length / 2;
    const lineEnd = lineStart + length;
    const crossings = fountains
      .filter((fountain) => Math.abs((axis === "x" ? fountain.z : fountain.x) - (axis === "x" ? z : x)) < 0.001)
      .map((fountain) => (axis === "x" ? fountain.x : fountain.z))
      .sort((a, b) => a - b);
    let segmentStart = lineStart;
    for (const crossing of crossings) {
      const gapStart = Math.max(segmentStart, crossing - plazaClearance);
      const gapEnd = Math.min(lineEnd, crossing + plazaClearance);
      if (gapStart > segmentStart) {
        const segmentLength = gapStart - segmentStart;
        roads.push({ axis, x: axis === "x" ? (segmentStart + gapStart) / 2 : x, z: axis === "z" ? (segmentStart + gapStart) / 2 : z, width: ROAD_WIDTH, length: segmentLength });
      }
      segmentStart = Math.max(segmentStart, gapEnd);
    }
    if (segmentStart < lineEnd) {
      const segmentLength = lineEnd - segmentStart;
      roads.push({ axis, x: axis === "x" ? (segmentStart + lineEnd) / 2 : x, z: axis === "z" ? (segmentStart + lineEnd) / 2 : z, width: ROAD_WIDTH, length: segmentLength });
    }
  };
  for (let x = 0; x <= town.width; x += slot) {
    addRoad("z", x, town.height / 2, town.height);
  }
  for (let z = 0; z <= town.height; z += slot) {
    addRoad("x", town.width / 2, z, town.width);
  }

  const treeOffsets = [
    { x: 0, z: 0 },
    ...Array.from({ length: 8 }, (_, i) => ({
      x: Math.cos(i * Math.PI / 4) * 0.75,
      z: Math.sin(i * Math.PI / 4) * 0.75,
    })),
  ];
  for (const lot of lots.filter((entry) => entry.use === "park" && !fountains.some((f) => f.x === entry.x && f.z === entry.z))) {
    const district = districts.find((d) => lot.x >= d.x && lot.x < d.x + d.size && lot.z >= d.z && lot.z < d.z + d.size);
    const districtId = district?.id ?? 0;
    const count = 1 + Math.floor(hash01(districtId, Math.round(lot.x + lot.z) + 40) * 3);
    const phase = Math.floor(hash01(districtId, Math.round(lot.x + lot.z) + 90) * treeOffsets.length);
    let placed = 0;
    for (let attempt = 0; attempt < treeOffsets.length && placed < count; attempt++) {
      const offset = treeOffsets[(attempt + phase) % treeOffsets.length]!;
      const tree = {
        x: lot.x + offset.x,
        z: lot.z + offset.z,
        s: 0.85 + hash01(districtId, Math.round(lot.x * 7 + lot.z * 11) + placed + 20) * 0.3,
        type: hash01(districtId, Math.round(lot.x * 13 + lot.z * 17) + attempt) < 0.62 ? "conifer" as const : "deciduous" as const,
      };
      const radius = tree.s * 0.5;
      const hitsBuilding = [...houses, ...workplaces].some((building) => {
        const roofMargin = 0.12;
        const dx = Math.max(Math.abs(tree.x - building.x) - building.w / 2 - roofMargin, 0);
        const dz = Math.max(Math.abs(tree.z - building.z) - building.d / 2 - roofMargin, 0);
        return Math.hypot(dx, dz) < radius;
      });
      const hitsRoad = roads.some((road) => {
        const distance = road.axis === "x" ? Math.abs(tree.z - road.z) : Math.abs(tree.x - road.x);
        const along = road.axis === "x" ? tree.x : tree.z;
        const center = road.axis === "x" ? road.x : road.z;
        return distance < road.width / 2 + radius && Math.abs(along - center) < road.length / 2 + radius;
      });
      const hitsFountain = fountains.some((f) => Math.hypot(tree.x - f.x, tree.z - f.z) < radius + 1.25);
      const hitsTree = trees.some((other) => Math.hypot(tree.x - other.x, tree.z - other.z) < radius + other.s * 0.5);
      if (hitsBuilding || hitsRoad || hitsFountain || hitsTree) continue;
      trees.push(tree);
      placed++;
    }
  }

  // Crossings line up with the quarter points of the town's street grid.
  const bridges: Bridge[] = [0.25, 0.75].map((fraction) => ({
    x: town.width + 12.25,
    z: Math.round((town.height * fraction) / slot) * slot,
    length: 25,
    width: 2.6,
  }));

  const waterfront: Waterfront = {
    beach: { x: town.width + 4.5, z: town.height / 2, width: 9, length: town.height + 16 },
    promenade: { x: town.width + 1.7, z: town.height / 2, width: 1.25, length: town.height + 16 },
  };

  const outerBridge = bridges[1] ?? bridges[0]!;
  // Keep the full 15-unit castle plinth beyond the channel, with a clear dry-bank gap.
  const castle: Castle = { x: town.width + 32, z: outerBridge.z, elevation: 0.65 };
  const mountains: Mountain[] = [
    { x: town.width + 60, z: castle.z - 20, radius: 18, height: 18 },
    { x: town.width + 65, z: castle.z + 2, radius: 16, height: 21 },
    { x: town.width + 70, z: castle.z + 24, radius: 17, height: 17 },
  ];

  const residentById = new Map(town.people.map((person) => [person.id, person]));
  const richHomes = houses
    .map((house) => ({
      house,
      resident: house.occupants
        .map((id) => residentById.get(id))
        .filter((person): person is Person => person !== undefined && person.money >= AFFLUENT_CAR_THRESHOLD)
        .sort((a, b) => b.money - a.money || a.id - b.id)[0],
    }))
    .filter((entry): entry is { house: House; resident: Person } => entry.house.id !== null && entry.resident !== undefined)
    .sort((a, b) => b.resident.money - a.resident.money || (a.house.id ?? 0) - (b.house.id ?? 0));
  const occupiedParkingSpots = new Set<string>();
  const cars: Car[] = [];
  for (const { house, resident } of richHomes) {
    const preferredSide = hash01(house.id ?? resident.id, 17) < 0.5 ? -1 : 1;
    for (const side of [preferredSide, -preferredSide]) {
      const roadZ = house.z + side * slot / 2;
      const key = `${house.x},${roadZ}`;
      if (roadZ < 0 || roadZ > town.height || occupiedParkingSpots.has(key)) continue;
      occupiedParkingSpots.add(key);
      cars.push({
        homeId: house.id!,
        residentId: resident.id,
        x: house.x,
        z: roadZ + side * 0.05,
        color: CAR_COLORS[Math.floor(hash01(resident.id, 808) * CAR_COLORS.length)] ?? CAR_COLORS[0]!,
      });
      break;
    }
  }

  return { width: town.width, depth: town.height, slot, houses, workplaces, trees, lamps, fountains, roads, bridges, cars, waterfront, mountains, castle, districts, lots, homeOf };
}

/** Moves a point out of any building so people walk on the roads. */
export function pushOut(layout: Layout, x: number, z: number, out: { x: number; z: number } = { x, z }): { x: number; z: number } {
  const margin = 0.3;
  out.x = x;
  out.z = z;
  for (const b of layout.houses) {
    const hw = b.w / 2 + margin;
    const hd = b.d / 2 + margin;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx);
      const pz = hd - Math.abs(dz);
      if (px < pz) out.x = b.x + Math.sign(dx || 1) * hw;
      else out.z = b.z + Math.sign(dz || 1) * hd;
      return out;
    }
  }
  for (const b of layout.workplaces) {
    const hw = b.w / 2 + margin;
    const hd = b.d / 2 + margin;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx);
      const pz = hd - Math.abs(dz);
      if (px < pz) out.x = b.x + Math.sign(dx || 1) * hw;
      else out.z = b.z + Math.sign(dz || 1) * hd;
      return out;
    }
  }
  return out;
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

/** Changes when the buildings, who lives in them, or the workplaces change. */
export function layoutSignature(layout: Layout): string {
  const houses = layout.houses.map((h) => `${h.id ?? "x"}:${h.kind}:${h.occupants.length}`).join(",");
  const work = layout.workplaces.map((w) => `${w.job}@${w.x},${w.z}`).join(",");
  const cars = layout.cars.map((car) => `${car.homeId}:${car.residentId}:${car.color}`).join(",");
  return `${houses}|${work}|${cars}`;
}
