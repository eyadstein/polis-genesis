import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTown } from "../src/load";
import { makeTown } from "./fixtures";

describe("parseTown", () => {
  it("accepts a good town", () => {
    const town = parseTown(JSON.stringify(makeTown()));
    expect(town.people).toHaveLength(6);
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseTown("not json")).toThrow("not valid JSON");
  });

  it("rejects another format version and says what to do", () => {
    const old = { ...makeTown(), version: 1 };
    expect(() => parseTown(JSON.stringify(old))).toThrow(/version 2.*version 1/);
  });

  it("names the field when a person is missing one", () => {
    const town = makeTown();
    const broken = JSON.parse(JSON.stringify(town));
    delete broken.people[3].money;
    expect(() => parseTown(JSON.stringify(broken))).toThrow('people[3] has a bad or missing field "money"');
  });

  it("rejects people listed out of order", () => {
    const town = makeTown();
    const swapped = { ...town, people: [town.people[1], town.people[0], ...town.people.slice(2)] };
    expect(() => parseTown(JSON.stringify(swapped))).toThrow("expected 0");
  });

  it("rejects parents that point at nobody", () => {
    const town = JSON.parse(JSON.stringify(makeTown()));
    town.people[2].parents = [0, 99];
    expect(() => parseTown(JSON.stringify(town))).toThrow("bad parents");
  });

  it("rejects a town with no people list", () => {
    const town = JSON.parse(JSON.stringify(makeTown()));
    delete town.people;
    expect(() => parseTown(JSON.stringify(town))).toThrow("people should be a list");
  });

  it.skipIf(!existsSync("public/town.json"))("accepts a real export from polis_cli", () => {
    const town = parseTown(readFileSync("public/town.json", "utf8"));
    expect(town.people.length).toBeGreaterThan(0);
    expect(town.districts).toHaveLength(16);
    expect(town.history.length).toBeGreaterThan(1);
    const living = town.people.filter((p) => p.alive);
    expect(living.every((p) => typeof p.voice === "string")).toBe(true);
  });
});
