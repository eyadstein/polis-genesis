import { FORMAT_VERSION, SUPPORTED_FORMAT_VERSIONS, type Town } from "./types";

type Shape = "number" | "string" | "boolean" | "number|null" | "string|null";

const PERSON_FIELDS: Record<string, Shape> = {
  id: "number",
  name: "string",
  alive: "boolean",
  age: "number",
  adult: "boolean",
  generation: "number",
  money: "number",
  job: "string|null",
  home: "number|null",
  home_kind: "string|null",
  home_district: "number|null",
  rent: "number|null",
  partner: "number|null",
  record: "number",
  jailed: "boolean",
  friends: "number",
  mood: "number",
  hunger: "number",
  x: "number",
  y: "number",
  voice: "string|null",
};

const DISTRICT_FIELDS: Record<string, Shape> = {
  id: "number",
  homes: "number",
  appeal: "number",
  occupancy: "number",
  neighbor_wealth: "number",
  mean_rent: "number",
};

const CONVERSATION_FIELDS: Record<string, Shape> = {
  tick: "number",
  speaker: "number",
  listener: "number",
  act: "string",
  about: "number|null",
  text: "string",
};

function matches(value: unknown, shape: Shape): boolean {
  return shape.split("|").some((part) => {
    if (part === "null") return value === null;
    if (part === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === part;
  });
}

function checkRecord(
  value: unknown,
  fields: Record<string, Shape>,
  where: string,
): void {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${where} should be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const [key, shape] of Object.entries(fields)) {
    if (!matches(record[key], shape)) {
      throw new Error(`${where} has a bad or missing field "${key}" (expected ${shape})`);
    }
  }
}

function checkList(
  value: unknown,
  fields: Record<string, Shape>,
  where: string,
): void {
  if (!Array.isArray(value)) throw new Error(`${where} should be a list`);
  value.forEach((item, index) => checkRecord(item, fields, `${where}[${index}]`));
}

/** Reads a town exported by polis_cli and checks it is what the viewer expects. */
export function parseTown(text: string): Town {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("That file does not hold a town");
  }
  const town = raw as Record<string, unknown>;
  if (!SUPPORTED_FORMAT_VERSIONS.includes(town.version as (typeof SUPPORTED_FORMAT_VERSIONS)[number])) {
    throw new Error(
      `This viewer reads town formats ${SUPPORTED_FORMAT_VERSIONS.join(" and ")}, but the file is version ${String(town.version)}. Export the town again with the latest polis_cli.`,
    );
  }
  for (const key of ["tick", "width", "height"]) {
    if (typeof town[key] !== "number" || !Number.isFinite(town[key])) {
      throw new Error(`Town is missing a finite "${key}"`);
    }
  }
  if (!Number.isSafeInteger(town.tick) || (town.tick as number) < 0) throw new Error("Town has a bad tick");
  if (!Number.isSafeInteger(town.width) || (town.width as number) < 4) throw new Error("Town has a bad width");
  if (!Number.isSafeInteger(town.height) || (town.height as number) < 4) throw new Error("Town has a bad height");
  if (town.version === FORMAT_VERSION) {
    checkRecord(
      town.run,
      { seed: "string", initial_population: "number", width: "number", height: "number" },
      "run",
    );
    const run = town.run as { seed: string; initial_population: number; width: number; height: number };
    const seed = run.seed;
    if (!/^(0|[1-9][0-9]*)$/.test(seed) || seed.length > 20 || (seed.length === 20 && seed > "18446744073709551615")) {
      throw new Error("run.seed should be an unsigned 64-bit decimal string");
    }
    if (!Number.isSafeInteger(run.initial_population) || run.initial_population < 1) {
      throw new Error("run.initial_population should be a positive safe integer");
    }
    if (run.width !== town.width || run.height !== town.height) {
      throw new Error("run dimensions do not match the town");
    }
  }
  if (typeof town.stats !== "object" || town.stats === null || Array.isArray(town.stats)) {
    throw new Error("stats should be an object");
  }
  const stats = town.stats as Record<string, unknown>;
  if (Object.values(stats).some((value) => !matches(value, "number"))) {
    throw new Error("stats should contain only finite numbers");
  }
  checkRecord(
    stats,
    { alive: "number", children: "number", couples: "number", max_generation: "number", gini: "number", employed: "number", homeless: "number" },
    "stats",
  );
  for (const key of ["alive", "children", "couples", "max_generation", "employed", "homeless"]) {
    if (!Number.isSafeInteger(stats[key]) || (stats[key] as number) < 0) {
      throw new Error(`stats.${key} should be a non-negative integer`);
    }
  }
  if ((stats.gini as number) < 0 || (stats.gini as number) > 1) throw new Error("stats.gini should be between 0 and 1");
  checkRecord(
    town.justice,
    { crimes: "number", convictions: "number", acquittals: "number", jailed: "number", treasury: "number" },
    "justice",
  );
  checkList(town.people, PERSON_FIELDS, "people");
  checkList(town.districts, DISTRICT_FIELDS, "districts");
  checkList(town.conversations, CONVERSATION_FIELDS, "conversations");
  if (!Array.isArray(town.history)) throw new Error("history should be a list");
  town.history.forEach((point, index) => {
    checkRecord(
      point,
      {
        tick: "number",
        alive: "number",
        children: "number",
        couples: "number",
        gini: "number",
        employed: "number",
        homeless: "number",
        vacant: "number",
        mean_money: "number",
        mean_rent: "number",
        crimes: "number",
        convictions: "number",
        treasury: "number",
      },
      `history[${index}]`,
    );
    const stock = (point as Record<string, unknown>).food_stock;
    if (town.version === FORMAT_VERSION && stock === undefined) {
      throw new Error(`history[${index}].food_stock is missing`);
    }
    if (stock !== undefined && (!Number.isSafeInteger(stock) || (stock as number) < 0)) {
      throw new Error(`history[${index}].food_stock should be a non-negative integer`);
    }
  });
  const foodStock = stats.food_stock;
  if (town.version === FORMAT_VERSION && foodStock === undefined) {
    throw new Error("stats.food_stock is missing");
  }
  if (foodStock !== undefined && (!Number.isSafeInteger(foodStock) || (foodStock as number) < 0)) {
    throw new Error("stats.food_stock should be a non-negative integer");
  }
  const people = town.people as Array<Record<string, unknown>>;
  const count = people.length;
  people.forEach((person, index) => {
    if (person.id !== index) throw new Error(`people[${index}] has id ${String(person.id)}, expected ${index}`);
    const parents = person.parents;
    if (parents !== null && parents !== undefined) {
      const ok =
        Array.isArray(parents) &&
        parents.length === 2 &&
        parents.every((p) => typeof p === "number" && p >= 0 && p < count);
      if (!ok) throw new Error(`people[${index}] has bad parents`);
    }
  });
  return raw as Town;
}
