import { mountLoader, mountTown } from "./app";
import { loadDefaultTown } from "./start";

const root = document.getElementById("app");

async function start(target: HTMLElement): Promise<void> {
  try {
    const town = await loadDefaultTown();
    if (town) mountTown(target, town);
    else mountLoader(target);
  } catch (error) {
    mountLoader(target, error instanceof Error ? error.message : "");
  }
}

if (root) void start(root);
