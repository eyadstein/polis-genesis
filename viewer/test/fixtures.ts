import type { Person, Town } from "../src/types";

export function person(fields: Partial<Person> & { id: number }): Person {
  return {
    name: `Person${fields.id}`,
    alive: true,
    age: 5000,
    adult: true,
    generation: 0,
    money: 50,
    job: null,
    home: null,
    home_kind: null,
    home_district: null,
    rent: null,
    partner: null,
    parents: null,
    record: 0,
    jailed: false,
    friends: 0,
    mood: 0,
    hunger: 0.8,
    x: fields.id * 3,
    y: fields.id * 2,
    voice: `You are Person${fields.id}. You feel content.`,
    ...fields,
  };
}

/** Two partners, two of their children, a person with a record, and someone who died. */
export function makeTown(): Town {
  const people: Person[] = [
    person({ id: 0, name: "Amal", partner: 1, job: "Farmer", money: 300, home: 0, home_kind: "House", home_district: 5, rent: 8, friends: 3, mood: 0.5 }),
    person({ id: 1, name: "Bahr", partner: 0, job: "Judge", money: 120, home: 0, home_kind: "House", home_district: 5, rent: 8, friends: 1, mood: -0.4 }),
    person({ id: 2, name: "Cara", parents: [0, 1], generation: 1, age: 1000, adult: false, money: 0, home: 0, home_kind: "House", home_district: 5, rent: 8 }),
    person({ id: 3, name: "Dov", parents: [0, 1], generation: 1, age: 4500, money: 5 }),
    person({ id: 4, name: "Esra", record: 2, jailed: true, money: 2, job: null }),
    person({ id: 5, name: "Fadi", alive: false, voice: null, money: 0 }),
  ];
  return {
    version: 2,
    tick: 8000,
    width: 64,
    height: 64,
    stats: { alive: 5, children: 1, couples: 1, max_generation: 1, gini: 0.61, employed: 2, homeless: 3 },
    justice: { crimes: 3, convictions: 1, acquittals: 1, jailed: 1, treasury: 400 },
    history: [
      { tick: 0, alive: 4, children: 0, couples: 0, gini: 0.1, employed: 0, homeless: 4, vacant: 2, mean_money: 100, mean_rent: 3, crimes: 0, convictions: 0, treasury: 300 },
      { tick: 4000, alive: 5, children: 1, couples: 1, gini: 0.4, employed: 2, homeless: 3, vacant: 5, mean_money: 90, mean_rent: 4, crimes: 2, convictions: 1, treasury: 350 },
      { tick: 8000, alive: 5, children: 1, couples: 1, gini: 0.61, employed: 2, homeless: 3, vacant: 8, mean_money: 80, mean_rent: 4, crimes: 3, convictions: 1, treasury: 400 },
    ],
    districts: Array.from({ length: 16 }, (_, id) => ({ id, homes: id, appeal: id / 15, occupancy: 0.5, neighbor_wealth: 0.4, mean_rent: 2 + id / 4 })),
    people,
    conversations: [
      { tick: 7990, speaker: 0, listener: 1, act: "Smalltalk", about: null, text: "Bahr, how is the work going?" },
      { tick: 7995, speaker: 1, listener: 0, act: "Gossip", about: 4, text: "Amal, I would keep my distance from Esra. I did not like what I saw." },
    ],
  };
}
