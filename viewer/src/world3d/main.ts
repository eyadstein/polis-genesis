import type { Town } from "../types";
import { startLive } from "./liveMode";
import { startReplay } from "./replayMode";

/** The living town, if its server is running. Otherwise null. */
async function findLiveTown(): Promise<Town | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch("/api/town", { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as Town;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fail(root: HTMLElement, error: unknown): void {
  const box = document.createElement("div");
  box.className = "world-error";
  const message = error instanceof Error ? error.message : String(error);
  box.textContent = `Could not load the world: ${message}. Start the living town with .\\run.ps1 in the project folder.`;
  root.append(box);
}

async function start(): Promise<void> {
  const root = document.getElementById("world") as HTMLElement;
  try {
    const live = await findLiveTown();
    if (live) await startLive(root, live);
    else await startReplay(root);
  } catch (error) {
    fail(root, error);
  }
}

void start();
