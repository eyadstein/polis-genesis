import { esc, barChart, historyChart } from "./chart";
import { faceFor, faceSvg, type Face } from "./faces";
import { legend, mapSvg, type MapMode } from "./map";
import {
  familyOf,
  filterPeople,
  jobsIn,
  moodWord,
  personById,
  sortPeople,
  wealthBuckets,
  years,
  living,
  type Filter,
  type SortKey,
} from "./stats";
import type { Person, Town } from "./types";

export type Tab = "map" | "people" | "charts" | "talk";

export const TABS: Array<{ id: Tab; label: string }> = [
  { id: "map", label: "Town map" },
  { id: "people", label: "People" },
  { id: "charts", label: "Charts" },
  { id: "talk", label: "Conversations" },
];

export interface ViewState {
  tab: Tab;
  mode: MapMode;
  selected: number | null;
  filter: Filter;
  sortKey: SortKey;
  descending: boolean;
}

/** A person's name as a button that selects them. */
export function nameButton(person: Person | undefined): string {
  if (!person) return "nobody";
  return `<button type="button" class="link" data-select="${person.id}">${esc(person.name)}</button>`;
}

export function tabsHtml(active: Tab): string {
  const buttons = TABS.map(
    (t) =>
      `<button type="button" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id === active}" aria-controls="content">${t.label}</button>`,
  ).join("");
  return `<div role="tablist" aria-label="Views">${buttons}</div>`;
}

export function summaryHtml(town: Town): string {
  const s = town.stats;
  const rows: Array<[string, string]> = [
    ["Living", String(s.alive)],
    ["Children", String(s.children)],
    ["Couples", String(s.couples)],
    ["Generations", String((s.max_generation ?? 0) + 1)],
    ["Inequality (Gini)", (s.gini ?? 0).toFixed(2)],
    ["Employed", String(s.employed)],
    ["Homeless", String(s.homeless)],
    ["Crimes", String(town.justice.crimes)],
    ["In prison", String(town.justice.jailed)],
  ];
  const items = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  return `<dl class="summary" aria-label="Town summary at tick ${town.tick}">${items}</dl>`;
}

export function mapTabHtml(town: Town, state: ViewState): string {
  const modes: Array<[MapMode, string]> = [
    ["wealth", "Savings"],
    ["mood", "Mood"],
    ["job", "Job"],
  ];
  const choices = modes
    .map(
      ([id, label]) =>
        `<label><input type="radio" name="mode" value="${id}"${state.mode === id ? " checked" : ""} /> ${label}</label>`,
    )
    .join("");
  const rows = town.districts
    .map(
      (d) =>
        `<tr><th scope="row">${d.id}</th><td>${d.homes}</td><td>${d.appeal.toFixed(2)}</td><td>${Math.round(d.occupancy * 100)}%</td><td>${d.neighbor_wealth.toFixed(2)}</td><td>${d.mean_rent.toFixed(1)}</td></tr>`,
    )
    .join("");
  return `<fieldset class="modes"><legend>Color the dots by</legend>${choices}</fieldset>
<div class="map" id="map">${mapSvg(town, state.mode, state.selected)}</div>
${legend(state.mode)}
<h2>Districts</h2>
<table><thead><tr><th scope="col">District</th><th scope="col">Homes</th><th scope="col">Appeal</th><th scope="col">Full</th><th scope="col">Neighbor wealth</th><th scope="col">Rent</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
  { key: "money", label: "Savings" },
  { key: "friends", label: "Friends" },
  { key: "generation", label: "Generation" },
  { key: "mood", label: "Mood" },
];

export function peopleRowsHtml(town: Town, state: ViewState): string {
  const people = sortPeople(filterPeople(town.people, state.filter), state.sortKey, state.descending);
  if (people.length === 0) return `<tr><td colspan="8">Nobody matches those filters.</td></tr>`;
  return people
    .map(
      (p) =>
        `<tr${p.id === state.selected ? ' aria-current="true"' : ""}><th scope="row">${nameButton(p)}</th><td>${years(p.age)}</td><td>${p.money}</td><td>${p.friends}</td><td>${p.generation}</td><td>${moodWord(p.mood)}</td><td>${esc(p.job ?? "none")}</td><td>${p.home === null ? "no home" : esc(p.home_kind ?? "")}</td></tr>`,
    )
    .join("");
}

export function peopleTabHtml(town: Town, state: ViewState): string {
  const f = state.filter;
  const jobs = ["", "none", ...jobsIn(town)]
    .map((j) => {
      const label = j === "" ? "Any job" : j === "none" ? "No job" : j;
      return `<option value="${esc(j)}"${f.job === j ? " selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
  const heads = COLUMNS.map((c) => {
    const current = state.sortKey === c.key;
    const dir = current ? (state.descending ? "descending" : "ascending") : "none";
    return `<th scope="col" aria-sort="${dir}"><button type="button" class="link" data-sort="${c.key}">${c.label}</button></th>`;
  }).join("");
  return `<form class="filters" role="search" aria-label="Filter people" onsubmit="return false">
<label>Search by name <input type="search" id="query" value="${esc(f.query)}" /></label>
<label>Job <select id="job">${jobs}</select></label>
<label><input type="checkbox" id="alive"${f.aliveOnly ? " checked" : ""} /> Living only</label>
<label><input type="checkbox" id="homeless"${f.homelessOnly ? " checked" : ""} /> Homeless only</label>
<label><input type="checkbox" id="record"${f.recordOnly ? " checked" : ""} /> With a record only</label>
</form>
<table><thead><tr>${heads}<th scope="col">Job</th><th scope="col">Home</th></tr></thead><tbody id="people-rows">${peopleRowsHtml(town, state)}</tbody></table>`;
}

export function chartsTabHtml(town: Town): string {
  const h = town.history;
  const people = living(town);
  return `<h2>Population</h2>
${historyChart("Population over time", h, [
    { key: "alive", label: "Living", color: "#1c5a56" },
    { key: "children", label: "Children", color: "#b0702a" },
    { key: "couples", label: "Couples", color: "#8d4f8a" },
  ])}
<h2>Inequality</h2>
${historyChart("Inequality over time, from 0 equal to 1 unequal", h, [{ key: "gini", label: "Gini", color: "#9a3f27" }])}
<h2>Savings today</h2>
${barChart("How many people hold how many coins", wealthBuckets(people), "#1c5a56")}
<h2>Work and housing</h2>
${historyChart("Work and housing over time", h, [
    { key: "employed", label: "Employed", color: "#2f6f9a" },
    { key: "homeless", label: "Homeless", color: "#9a3f27" },
    { key: "vacant", label: "Empty homes", color: "#5a7d2a" },
  ])}
<h2>Law and the treasury</h2>
${historyChart("Crime and the town treasury over time", h, [
    { key: "crimes", label: "Crimes", color: "#9a3f27" },
    { key: "convictions", label: "Convictions", color: "#33478f" },
    { key: "treasury", label: "Treasury", color: "#1c5a56" },
  ])}`;
}

export function talkTabHtml(town: Town): string {
  if (town.conversations.length === 0) return `<p>Nobody has spoken yet.</p>`;
  const items = [...town.conversations]
    .reverse()
    .map((c) => {
      const speaker = personById(town, c.speaker);
      const listener = personById(town, c.listener);
      const about = c.about === null ? "" : ` about ${nameButton(personById(town, c.about))}`;
      return `<li><p class="meta">Tick ${c.tick}. ${nameButton(speaker)} to ${nameButton(listener)}, ${esc(c.act.toLowerCase())}${about}</p><p>${esc(c.text)}</p></li>`;
    })
    .join("");
  return `<ol class="talk" aria-label="Recent conversations, newest first">${items}</ol>`;
}

function list(label: string, people: Person[]): string {
  if (people.length === 0) return "";
  return `<dt>${label}</dt><dd>${people.map((p) => nameButton(p)).join(", ")}</dd>`;
}

const faceCaches = new WeakMap<Person[], Map<number, Face>>();

/** Portrait for one person, cached per town. */
export function portraitHtml(town: Town, person: Person): string {
  let cache = faceCaches.get(town.people);
  if (!cache) {
    cache = new Map();
    faceCaches.set(town.people, cache);
  }
  const byId = new Map(town.people.map((p) => [p.id, p]));
  const face = faceFor(person.id, byId, cache);
  return `<div class="portrait">${faceSvg(face, 96, years(person.age))}</div>`;
}

export function detailHtml(town: Town, id: number | null): string {
  const person = id === null ? undefined : town.people[id];
  if (!person) {
    return `<h2>Person</h2><p>Choose someone on the map, in the people list, or in a conversation to see their life.</p>`;
  }
  const family = familyOf(town, person.id);
  const facts: Array<[string, string]> = [
    ["Age", `${years(person.age)} years`],
    ["Generation", String(person.generation)],
    ["Savings", `${person.money} coins`],
    ["Job", person.job ?? "none"],
    [
      "Home",
      person.home === null
        ? "none"
        : `${person.home_kind ?? ""} in district ${person.home_district ?? "?"}, rent ${person.rent ?? 0}`,
    ],
    ["Friends", String(person.friends)],
    ["Mood", moodWord(person.mood)],
  ];
  if (person.record > 0) facts.push(["Record", `${person.record} conviction${person.record === 1 ? "" : "s"}${person.jailed ? ", in prison now" : ""}`]);
  const rows = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  const voice = person.alive
    ? `<h3>In their own words</h3><p class="voice">${esc(person.voice ?? "")}</p>`
    : `<p>${esc(person.name)} has died.</p>`;
  return `${portraitHtml(town, person)}<h2>${esc(person.name)}</h2>
<dl class="facts">${rows}</dl>
${voice}
<h3>Family</h3>
<dl class="facts">${list("Parents", family.parents)}${family.partner ? list("Partner", [family.partner]) : ""}${list("Children", family.children)}${list("Siblings", family.siblings)}</dl>`;
}
