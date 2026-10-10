import { SimClock } from "./clock";
import { createHud } from "./hud";
import { buildLayout } from "./layout";
import { deriveNews, newsAt } from "./news";
import { ReplayPlayer, parseReplay } from "./replay";
import { WorldScene } from "./scene";
import type { Town } from "../types";

const TALK_WINDOW = 18;
const TALK_LINES = 7;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function fail(root: HTMLElement, error: unknown): void {
  const box = document.createElement("div");
  box.className = "world-error";
  const message = error instanceof Error ? error.message : String(error);
  box.textContent = `Could not load the world: ${message}. Run the simulation first: cargo run --release -p polis_cli -- 1 3000 200 viewer/public/town.json viewer/public/replay.json 10`;
  root.append(box);
}

async function start(): Promise<void> {
  const root = document.getElementById("world") as HTMLElement;
  try {
    const [townRaw, replayRaw] = await Promise.all([fetchJson("/town.json"), fetchJson("/replay.json")]);
    const town = townRaw as Town;
    const player = new ReplayPlayer(parseReplay(replayRaw));
    const layout = buildLayout(town);
    const headlines = deriveNews(player, town);
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
      hud.setNews(newsAt(headlines, clock.tick)?.text ?? null);
      hud.update();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    fail(root, error);
  }
}

void start();
