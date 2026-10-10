/** On screen controls: clock, speed, news, conversations, and the cards for people and buildings. */

import { faceFor, faceSvg } from "../faces";
import { years } from "../stats";
import type { Person, Town } from "../types";
import { SimClock, TICKS_PER_DAY, clockLabel, phaseName } from "./clock";
import { residentsByFloor, workersOf, type Building, type Layout } from "./layout";
import { QUIET_NEWS } from "./news";
import type { ReplayTalk } from "./replay";
import { parseTraits } from "./traits";

const SPEEDS: [label: string, ticksPerSecond: number][] = [
  ["6 minutes per second", 0.1],
  ["15 minutes per second", 0.25],
  ["30 minutes per second", 0.5],
  ["1 hour per second", 1],
  ["4 hours per second", 4],
  ["12 hours per second", 12],
  ["1 day per second", 24],
  ["3 days per second", 72],
];
const DEFAULT_SPEED = 0.25;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "hud-button", label);
  b.type = "button";
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function link(label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "hud-link", label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function moodWord(mood: number): string {
  if (mood > 0.75) return "joyful";
  if (mood > 0.55) return "content";
  if (mood > 0.35) return "uneasy";
  return "miserable";
}

export interface HudHooks {
  onClosePerson(): void;
  onCloseBuilding(): void;
  onSelectPerson(id: number): void;
  onSelectHome(homeId: number): void;
}

export interface Hud {
  update(): void;
  showPerson(id: number | null): void;
  showBuilding(building: Building | null): void;
  setTalk(lines: ReplayTalk[]): void;
  setNews(text: string | null): void;
}

export function createHud(root: HTMLElement, clock: SimClock, town: Town, layout: Layout, hooks: HudHooks): Hud {
  const people = new Map(town.people.map((p) => [p.id, p]));
  const faces = new Map();
  const nameOf = (id: number): string => people.get(id)?.name ?? `Person ${id}`;
  const personLink = (id: number): HTMLButtonElement => link(nameOf(id), () => hooks.onSelectPerson(id));
  const districtName = (d: number | null): string => (d === null ? "nowhere" : (layout.districts[d]?.name ?? `District ${d}`));

  const clockBox = el("div", "hud-panel hud-clock");
  const clockText = el("div", "hud-time");
  const phaseText = el("div", "hud-phase");
  clockBox.append(clockText, phaseText);

  const news = el("div", "hud-panel hud-news");
  news.setAttribute("role", "status");
  const newsTag = el("span", "hud-news-tag", "NEWS");
  const newsText = el("span", "hud-news-text", QUIET_NEWS);
  news.append(newsTag, newsText);

  const bar = el("div", "hud-panel hud-bar");
  const scrub = el("input", "hud-scrub");
  scrub.type = "range";
  scrub.min = String(clock.min);
  scrub.max = String(clock.max);
  scrub.step = "0.1";
  scrub.value = String(clock.tick);
  scrub.setAttribute("aria-label", "Time");
  scrub.addEventListener("input", () => clock.seek(Number(scrub.value)));

  const play = button("Play", "Play or pause (space)", () => clock.togglePlay());
  const direction = button("Forward", "Run time forward or backward", () => {
    clock.setSpeed(-clock.speed);
    refresh();
  });
  const speed = el("select", "hud-select");
  speed.setAttribute("aria-label", "Speed");
  for (const [label, value] of SPEEDS) {
    const o = el("option", undefined, label);
    o.value = String(value);
    o.selected = value === DEFAULT_SPEED;
    speed.append(o);
  }
  speed.addEventListener("change", () => {
    const sign = clock.speed < 0 ? -1 : 1;
    clock.setSpeed(sign * Number(speed.value));
  });
  clock.setSpeed(DEFAULT_SPEED);

  const talkToggle = button("Conversations: on", "Show or hide what people say", () => {
    feed.hidden = !feed.hidden;
    talkToggle.textContent = feed.hidden ? "Conversations: off" : "Conversations: on";
  });

  const controls = el("div", "hud-row");
  controls.append(
    button("Back 1 day", "Go back one day (shift and left arrow)", () => clock.skip(-TICKS_PER_DAY)),
    button("Back 1 hour", "Go back one hour (left arrow)", () => clock.skip(-1)),
    play,
    button("Ahead 1 hour", "Go ahead one hour (right arrow)", () => clock.skip(1)),
    button("Ahead 1 day", "Go ahead one day (shift and right arrow)", () => clock.skip(TICKS_PER_DAY)),
    direction,
    speed,
    talkToggle,
  );
  bar.append(scrub, controls);

  const feed = el("div", "hud-panel hud-feed");
  feed.setAttribute("aria-live", "polite");
  const card = el("div", "hud-panel hud-card");
  card.hidden = true;

  root.append(clockBox, news, bar, feed, card);

  function refresh(): void {
    play.textContent = clock.playing ? "Pause" : "Play";
    direction.textContent = clock.speed < 0 ? "Backward" : "Forward";
  }

  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" && target.getAttribute("type") !== "range") return;
    if (e.code === "Space") {
      e.preventDefault();
      clock.togglePlay();
    } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      const sign = e.code === "ArrowLeft" ? -1 : 1;
      clock.skip(sign * (e.shiftKey ? TICKS_PER_DAY : 1));
    }
    refresh();
  });
  play.addEventListener("click", refresh);

  function facts(rows: [string, string | HTMLElement][]): HTMLElement {
    const list = el("dl", "hud-facts");
    for (const [k, v] of rows) {
      const dd = el("dd");
      dd.append(v);
      list.append(el("dt", undefined, k), dd);
    }
    return list;
  }

  function showPerson(id: number | null): void {
    const p: Person | undefined = id === null ? undefined : people.get(id);
    if (!p) {
      if (card.dataset.kind === "person") card.hidden = true;
      return;
    }
    card.replaceChildren();
    card.dataset.kind = "person";
    card.hidden = false;
    const age = years(p.age);
    const face = el("div", "hud-portrait");
    face.innerHTML = faceSvg(faceFor(p.id, people, faces), 120, age);
    const traits = el("div", "hud-chips");
    for (const t of parseTraits(p.voice)) traits.append(el("span", "hud-chip", t));
    const home: string | HTMLElement =
      p.home === null ? "no home" : link(`${p.home_kind ?? "Home"} in ${districtName(p.home_district)}`, () => hooks.onSelectHome(p.home as number));
    const parents = p.parents ? el("span") : null;
    if (parents && p.parents) parents.append(personLink(p.parents[0]), ", ", personLink(p.parents[1]));
    const partner = p.partner === null ? null : personLink(p.partner);
    const close = button("Close", "Close", hooks.onClosePerson);
    card.append(
      face,
      el("h2", undefined, p.name),
      el("p", "hud-sub", `${age} years old now, generation ${p.generation}`),
      traits,
      facts([
        ["Job", p.job ?? "none"],
        ["Home", home],
        ["Savings", `${p.money} coins`],
        ["Feeling", moodWord(p.mood)],
        ["Hunger", `${Math.round(p.hunger * 100)} percent`],
        ["Partner", partner ?? "none"],
        ["Parents", parents ?? "unknown"],
        ["Friends", String(p.friends)],
      ]),
      close,
    );
  }

  function showBuilding(b: Building | null): void {
    if (!b) {
      if (card.dataset.kind === "building") card.hidden = true;
      return;
    }
    card.replaceChildren();
    card.dataset.kind = "building";
    card.hidden = false;
    const close = button("Close", "Close", hooks.onCloseBuilding);
    if (b.type === "house") {
      card.append(el("h2", undefined, b.id === null ? `Vacant ${b.kind.toLowerCase()}` : `${b.kind}, home ${b.id}`), el("p", "hud-sub", `${districtName(b.district)}, ${b.floors} floor${b.floors > 1 ? "s" : ""}`));
      if (b.occupants.length === 0) card.append(el("p", undefined, "Nobody lives here."));
      for (const f of residentsByFloor(b).reverse()) {
        const row = el("div", "hud-floor");
        row.append(el("strong", undefined, b.floors > 1 ? `Floor ${f.floor}` : "Residents"));
        const names = el("div");
        f.people.forEach((id, i) => names.append(i ? ", " : "", personLink(id)));
        row.append(names);
        card.append(row);
      }
    } else {
      const workers = workersOf(layout, town, b);
      card.append(el("h2", undefined, b.title), el("p", "hud-sub", `${districtName(b.district)}, ${workers.length} ${workers.length === 1 ? "worker" : "workers"}`));
      const names = el("div", "hud-floor");
      workers.forEach((w, i) => names.append(i ? ", " : "", personLink(w.id)));
      card.append(names);
    }
    card.append(close);
  }

  let feedKey = "";
  function setTalk(lines: ReplayTalk[]): void {
    const last = lines[lines.length - 1];
    const key = `${lines.length}:${last?.[0] ?? 0}:${last?.[3] ?? ""}`;
    if (key === feedKey) return;
    feedKey = key;
    feed.replaceChildren(el("h3", undefined, "Conversations"));
    if (lines.length === 0) feed.append(el("p", "hud-sub", "Nobody is talking right now."));
    for (const [tick, speaker, listener, text] of lines) {
      const row = el("p", "hud-line");
      row.append(el("time", undefined, clockLabel(tick).slice(-5) + " "), personLink(speaker), " to ", personLink(listener), `: ${text}`);
      feed.append(row);
    }
  }

  function setNews(text: string | null): void {
    const value = text ?? QUIET_NEWS;
    news.classList.toggle("hud-news-quiet", text === null);
    if (newsText.textContent !== value) newsText.textContent = value;
  }

  function update(): void {
    clockText.textContent = clockLabel(clock.tick);
    phaseText.textContent = phaseName(clock.tick);
    if (document.activeElement !== scrub) scrub.value = String(clock.tick);
    refresh();
  }

  refresh();
  return { update, showPerson, showBuilding, setTalk, setNews };
}
