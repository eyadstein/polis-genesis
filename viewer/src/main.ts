import { mountLoader, mountTown } from "./app";
import { parseTown } from "./load";

const root = document.getElementById("app");

async function start(target: HTMLElement): Promise<void> {
  try {
    const response = await fetch("/town.json");
    if (!response.ok) {
      mountLoader(target);
      return;
    }
    mountTown(target, parseTown(await response.text()));
  } catch (error) {
    mountLoader(target, error instanceof Error ? error.message : "");
  }
}

if (root) void start(root);
