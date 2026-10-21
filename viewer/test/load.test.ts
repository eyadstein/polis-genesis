import { readFileSync } from "node:fs";
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

  it("rejects unsupported format versions and says what to do", () => {
    const old = { ...makeTown(), version: 1 };
    expect(() => parseTown(JSON.stringify(old))).toThrow(/formats 2 and 3.*version 1/);
  });

  it("continues to read version 2 exports without run metadata", () => {
    const old = { ...makeTown(), version: 2 };
    delete (old as Partial<typeof old>).run;
    expect(parseTown(JSON.stringify(old)).version).toBe(2);
  });

  it("requires run metadata and matching dimensions in version 3", () => {
    const missing = { ...makeTown() };
    delete (missing as Partial<typeof missing>).run;
    expect(() => parseTown(JSON.stringify(missing))).toThrow('run should be an object');

    const mismatched = { ...makeTown(), run: { ...makeTown().run!, width: 32 } };
    expect(() => parseTown(JSON.stringify(mismatched))).toThrow("run dimensions do not match");

    const preciseSeed = { ...makeTown(), run: { ...makeTown().run!, seed: "18446744073709551615" } };
    expect(parseTown(JSON.stringify(preciseSeed)).run?.seed).toBe("18446744073709551615");

    const invalidSeed = { ...makeTown(), run: { ...makeTown().run!, seed: "18446744073709551616" } };
    expect(() => parseTown(JSON.stringify(invalidSeed))).toThrow("unsigned 64-bit decimal string");
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

  it("rejects malformed history and invalid resource counts", () => {
    const brokenHistory = JSON.parse(JSON.stringify(makeTown()));
    brokenHistory.history[1].treasury = "many";
    expect(() => parseTown(JSON.stringify(brokenHistory))).toThrow('history[1] has a bad or missing field "treasury"');

    const brokenStock = JSON.parse(JSON.stringify(makeTown()));
    brokenStock.stats.food_stock = -1;
    expect(() => parseTown(JSON.stringify(brokenStock))).toThrow("stats.food_stock should be a non-negative integer");

    const missingStock = JSON.parse(JSON.stringify(makeTown()));
    delete missingStock.history[0].food_stock;
    expect(() => parseTown(JSON.stringify(missingStock))).toThrow("history[0].food_stock is missing");
  });

  it("rejects missing summary values and invalid aggregate ranges", () => {
    const missingAlive = JSON.parse(JSON.stringify(makeTown()));
    delete missingAlive.stats.alive;
    expect(() => parseTown(JSON.stringify(missingAlive))).toThrow('stats has a bad or missing field "alive"');

    const impossibleGini = JSON.parse(JSON.stringify(makeTown()));
    impossibleGini.stats.gini = 1.4;
    expect(() => parseTown(JSON.stringify(impossibleGini))).toThrow("stats.gini should be between 0 and 1");
  });

  it("accepts a real export produced by polis_cli", () => {
    const town = parseTown(readFileSync("test/fixtures/cli_export.json", "utf8"));
    expect(town.people.length).toBeGreaterThan(0);
    expect(town.districts).toHaveLength(16);
    expect(town.history.length).toBeGreaterThan(1);
    const living = town.people.filter((p) => p.alive);
    expect(living.every((p) => typeof p.voice === "string")).toBe(true);
  });
});
