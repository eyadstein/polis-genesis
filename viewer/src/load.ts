import { FORMAT_VERSION, type Town } from "./types";

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
  if (typeof raw !== "object" || raw === null) {
    throw new Error("That file does not hold a town");
  }
  const town = raw as Record<string, unknown>;
  if (town.version !== FORMAT_VERSION) {
    throw new Error(
      `This viewer reads format version ${FORMAT_VERSION}, but the file is version ${String(town.version)}. Export the town again with the latest polis_cli.`,
    );
  }
  for (const key of ["tick", "width", "height"]) {
    if (typeof town[key] !== "number") throw new Error(`Town is missing "${key}"`);
  }
  checkList(town.people, PERSON_FIELDS, "people");
  checkList(town.districts, DISTRICT_FIELDS, "districts");
  checkList(town.conversations, CONVERSATION_FIELDS, "conversations");
  if (!Array.isArray(town.history)) throw new Error("history should be a list");
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
