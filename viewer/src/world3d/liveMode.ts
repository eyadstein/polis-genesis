/** Shows the living town: it never ends, and you can change it while it runs. */

import type { Town } from "../types";
import { SimClock } from "./clock";
import { createHud } from "./hud";
import { buildLayout, layoutSignature } from "./layout";
import { LiveFeed, POLL_MS, TOWN_MS, nextRenderTick } from "./live";
import { NewsFeed, describe, newsAt, type NewsItem } from "./news";
import { WorldScene } from "./scene";

const TALK_WINDOW = 18;
const TALK_LINES = 7;

export async function startLive(root: HTMLElement, firstTown: Town, feed: LiveFeed = new LiveFeed()): Promise<void> {
  await feed.connect();
  let town = firstTown;
  let layout = buildLayout(town);
  let signature = layoutSignature(layout);
  const news = new NewsFeed();
  for (const frame of feed.player.replay.frames) news.push(frame);
  const clock = new SimClock(feed.player.startTick, feed.player.endTick, feed.player.endTick);
  let renderTick = Math.max(0, feed.status.tick - 1);

  const host = document.createElement("div");
  host.className = "world-canvas";
  root.append(host);
  const scene = new WorldScene(host, layout, town);
  const hud = createHud(
    root,
    clock,
    town,
    layout,
    {
      onClosePerson: () => scene.select(null),
      onCloseBuilding: () => scene.selectBuilding(null),
      onSelectPerson: (id) => scene.select(id),
      onSelectHome: (homeId) => scene.selectHome(homeId),
    },
    {
      status: () => feed.status,
      setPaused: (paused) => void command(feed.setClock({ paused })),
      setSpeed: (speed) => void command(feed.setClock({ speed })),
      addPeople: (count) => void command(feed.addPeople(count).then(refreshTown)),
    },
  );
  scene.onSelect = (id) => hud.showPerson(id);
  scene.onBuilding = (building) => hud.showBuilding(building);

  async function command(work: Promise<unknown>): Promise<void> {
    try {
      await work;
      hud.setNotice(null);
    } catch (error) {
      hud.setNotice(error instanceof Error ? error.message : "The town refused that.");
    }
  }

  async function refreshTown(): Promise<void> {
    town = await feed.town();
    scene.syncPeople(town);
    const next = buildLayout(town);
    const nextSignature = layoutSignature(next);
    if (nextSignature !== signature) {
      layout = next;
      signature = nextSignature;
      scene.rebuildPlaces(layout);
    }
    hud.setTown(town, layout);
  }

  let connected = true;
  let polling = false;
  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      for (const frame of await feed.poll()) news.push(frame);
      if (!connected) {
        connected = true;
        hud.setNotice(null);
        await refreshTown();
      }
    } catch {
      connected = false;
      hud.setNotice("Lost the town. Is the server still running? Trying again.");
    } finally {
      polling = false;
    }
  }
  setInterval(() => void poll(), POLL_MS);
  setInterval(() => void refreshTown().catch(() => undefined), TOWN_MS);

  let shown: NewsItem | null = null;
  let shownText: string | null = null;
  let last = performance.now();
  const frame = (now: number): void => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    const { speed, paused } = feed.status;
    renderTick = nextRenderTick(renderTick, feed.player.endTick, speed, paused, seconds);
    clock.setRange(feed.player.startTick, feed.player.endTick);
    clock.seek(renderTick);
    scene.update(renderTick, feed.player.sample(renderTick), seconds);
    hud.setTalk(feed.player.talkBetween(renderTick - TALK_WINDOW, renderTick).slice(-TALK_LINES));
    const item = newsAt(news.items, renderTick);
    if (item !== shown) {
      shown = item;
      shownText = item ? describe(item, town) : null;
    }
    hud.setNews(shownText);
    hud.update();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
