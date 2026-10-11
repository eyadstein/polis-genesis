/** Plays back a recorded run from town.json and replay.json. */

import type { Town } from "../types";
import { SimClock } from "./clock";
import { createHud } from "./hud";
import { buildLayout } from "./layout";
import { deriveNews, describe, newsAt } from "./news";
import { ReplayPlayer, parseReplay } from "./replay";
import { WorldScene } from "./scene";

const TALK_WINDOW = 18;
const TALK_LINES = 7;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

export async function startReplay(root: HTMLElement): Promise<void> {
  const [townRaw, replayRaw] = await Promise.all([fetchJson("/town.json"), fetchJson("/replay.json")]);
  const town = townRaw as Town;
  const player = new ReplayPlayer(parseReplay(replayRaw));
  const layout = buildLayout(town);
  const headlines = deriveNews(player);
  const clock = new SimClock(player.startTick, player.endTick, player.startTick);

  const host = document.createElement("div");
  host.className = "world-canvas";
  root.append(host);
  const scene = new WorldScene(host, layout, town);
  const hud = createHud(root, clock, town, layout, {
    onClosePerson: () => scene.select(null),
    onCloseBuilding: () => scene.selectBuilding(null),
    onSelectPerson: (id) => scene.select(id),
    onSelectHome: (homeId) => scene.selectHome(homeId),
  });
  scene.onSelect = (id) => hud.showPerson(id);
  scene.onBuilding = (building) => hud.showBuilding(building);

  let last = performance.now();
  const frame = (now: number): void => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock.advance(seconds);
    scene.update(clock.tick, player.sample(clock.tick), seconds);
    hud.setTalk(player.talkBetween(clock.tick - TALK_WINDOW, clock.tick).slice(-TALK_LINES));
    const item = newsAt(headlines, clock.tick);
    hud.setNews(item ? describe(item, town) : null);
    hud.update();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
