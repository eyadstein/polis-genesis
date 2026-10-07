import { describe, expect, it } from "vitest";
import {
  NO_FILTER,
  childrenOf,
  familyOf,
  filterPeople,
  gini,
  jobsIn,
  living,
  moodWord,
  sortPeople,
  wealthBuckets,
  years,
} from "../src/stats";
import { makeTown, person } from "./fixtures";

describe("gini", () => {
  it("is 0 for equal holdings and high for one holder", () => {
    expect(gini([10, 10, 10, 10])).toBeCloseTo(0);
    expect(gini([0, 0, 0, 100])).toBeGreaterThan(0.7);
    expect(gini([])).toBe(0);
  });
});

describe("wealth buckets", () => {
  it("count every person exactly once", () => {
    const people = [0, 1, 4, 5, 19, 20, 99, 100, 1599, 1600, 99999].map((money, id) => person({ id, money }));
    const buckets = wealthBuckets(people);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(people.length);
    expect(buckets[0]?.count).toBe(1);
    expect(buckets.at(-1)?.count).toBe(2);
  });
});

describe("years and mood", () => {
  it("turn ticks and numbers into words", () => {
    expect(years(1999)).toBe(3);
    expect(moodWord(0.9)).toBe("happy");
    expect(moodWord(0.2)).toBe("content");
    expect(moodWord(0)).toBe("uneasy");
    expect(moodWord(-0.9)).toBe("low");
  });
});

describe("families", () => {
  const town = makeTown();

  it("find children, parents, partner and siblings", () => {
    expect(childrenOf(town, 0).map((p) => p.name)).toEqual(["Cara", "Dov"]);
    const cara = familyOf(town, 2);
    expect(cara.parents.map((p) => p.name)).toEqual(["Amal", "Bahr"]);
    expect(cara.siblings.map((p) => p.name)).toEqual(["Dov"]);
    expect(familyOf(town, 0).partner?.name).toBe("Bahr");
  });

  it("handle someone with no family and a missing person", () => {
    const alone = familyOf(town, 4);
    expect(alone.parents).toEqual([]);
    expect(alone.partner).toBeUndefined();
    expect(familyOf(town, 99).children).toEqual([]);
  });
});

describe("filters and sorting", () => {
  const town = makeTown();

  it("hide the dead unless asked", () => {
    expect(filterPeople(town.people, NO_FILTER)).toHaveLength(5);
    expect(filterPeople(town.people, { ...NO_FILTER, aliveOnly: false })).toHaveLength(6);
  });

  it("search names without regard to case", () => {
    expect(filterPeople(town.people, { ...NO_FILTER, query: "AM" }).map((p) => p.name)).toEqual(["Amal"]);
  });

  it("filter by job, home and record", () => {
    expect(filterPeople(town.people, { ...NO_FILTER, job: "Judge" }).map((p) => p.name)).toEqual(["Bahr"]);
    expect(filterPeople(town.people, { ...NO_FILTER, job: "none" })).toHaveLength(3);
    expect(filterPeople(town.people, { ...NO_FILTER, homelessOnly: true }).map((p) => p.name)).toEqual(["Dov", "Esra"]);
    expect(filterPeople(town.people, { ...NO_FILTER, recordOnly: true }).map((p) => p.name)).toEqual(["Esra"]);
  });

  it("sort by a number or a name, and break ties by id", () => {
    const byMoney = sortPeople(town.people, "money", true).map((p) => p.name);
    expect(byMoney.slice(0, 2)).toEqual(["Amal", "Bahr"]);
    expect(sortPeople(town.people, "name", false)[0]?.name).toBe("Amal");
    const tied = sortPeople([person({ id: 1, money: 5 }), person({ id: 0, money: 5 })], "money", true);
    expect(tied.map((p) => p.id)).toEqual([0, 1]);
  });

  it("do not change the original list", () => {
    const before = town.people.map((p) => p.id);
    sortPeople(town.people, "money", true);
    expect(town.people.map((p) => p.id)).toEqual(before);
  });

  it("list the jobs in a town and the living", () => {
    expect(jobsIn(town)).toEqual(["Farmer", "Judge"]);
    expect(living(town)).toHaveLength(5);
  });
});
