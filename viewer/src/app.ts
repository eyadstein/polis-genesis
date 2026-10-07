import { parseTown } from "./load";
import { NO_FILTER, type SortKey } from "./stats";
import type { Town } from "./types";
import {
  chartsTabHtml,
  detailHtml,
  mapTabHtml,
  peopleRowsHtml,
  peopleTabHtml,
  summaryHtml,
  talkTabHtml,
  tabsHtml,
  type Tab,
  type ViewState,
} from "./views";

export function initialState(): ViewState {
  return {
    tab: "map",
    mode: "wealth",
    selected: null,
    filter: { ...NO_FILTER },
    sortKey: "money",
    descending: true,
  };
}

function content(town: Town, state: ViewState): string {
  switch (state.tab) {
    case "map":
      return mapTabHtml(town, state);
    case "people":
      return peopleTabHtml(town, state);
    case "charts":
      return chartsTabHtml(town);
    case "talk":
      return talkTabHtml(town);
  }
}

/** Shows a town in the page and wires up clicks, typing, and keys. */
export function mountTown(root: HTMLElement, town: Town): ViewState {
  const state = initialState();

  const renderAll = () => {
    root.innerHTML = `<header><h1>Polis Genesis</h1>${summaryHtml(town)}${tabsHtml(state.tab)}</header>
<div class="layout"><main id="content" role="tabpanel" tabindex="-1">${content(town, state)}</main><aside id="detail" aria-label="Person details">${detailHtml(town, state.selected)}</aside></div>`;
  };
  const renderContent = () => {
    const main = root.querySelector("#content");
    if (main) main.innerHTML = content(town, state);
    root.querySelectorAll("[data-tab]").forEach((b) => {
      b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === state.tab));
    });
  };
  const renderDetail = () => {
    const aside = root.querySelector("#detail");
    if (aside) aside.innerHTML = detailHtml(town, state.selected);
  };
  const renderRows = () => {
    const body = root.querySelector("#people-rows");
    if (body) body.innerHTML = peopleRowsHtml(town, state);
  };

  root.addEventListener("click", (event) => {
    const target = (event.target as Element).closest("[data-select],[data-tab],[data-sort]");
    if (!target) return;
    const pick = target.getAttribute("data-select");
    if (pick !== null) {
      state.selected = Number(pick);
      renderDetail();
      if (state.tab === "map") renderContent();
      else if (state.tab === "people") renderRows();
      return;
    }
    const tab = target.getAttribute("data-tab");
    if (tab !== null) {
      state.tab = tab as Tab;
      renderContent();
      return;
    }
    const key = target.getAttribute("data-sort") as SortKey | null;
    if (key !== null) {
      state.descending = state.sortKey === key ? !state.descending : key !== "name";
      state.sortKey = key;
      renderContent();
    }
  });

  root.addEventListener("change", (event) => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (el.name === "mode") {
      state.mode = el.value as ViewState["mode"];
      renderContent();
    } else if (el.id === "job") {
      state.filter.job = el.value;
      renderRows();
    } else if (el.id === "alive") {
      state.filter.aliveOnly = (el as HTMLInputElement).checked;
      renderRows();
    } else if (el.id === "homeless") {
      state.filter.homelessOnly = (el as HTMLInputElement).checked;
      renderRows();
    } else if (el.id === "record") {
      state.filter.recordOnly = (el as HTMLInputElement).checked;
      renderRows();
    }
  });

  root.addEventListener("input", (event) => {
    const el = event.target as HTMLInputElement;
    if (el.id === "query") {
      state.filter.query = el.value;
      renderRows();
    }
  });

  root.addEventListener("keydown", (event) => {
    const el = event.target as Element;
    if (el.getAttribute("role") !== "tab") return;
    const ids = Array.from(root.querySelectorAll<HTMLElement>("[data-tab]"));
    const index = ids.indexOf(el as HTMLElement);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const next = ids[(index + step + ids.length) % ids.length];
    next?.focus();
    next?.click();
  });

  renderAll();
  return state;
}

const LOADER = `<main class="loader"><h1>Polis Genesis</h1>
<p>Choose a town file to look at. Make one by running the simulation with a file name as the fourth argument.</p>
<pre>cargo run --release -p polis_cli -- 1 8000 200 viewer/public/town.json</pre>
<label>Town file <input type="file" id="file" accept="application/json,.json" /></label>
<p id="problem" role="alert"></p></main>`;

/** Shows the file picker, and mounts the town when a good file is chosen. */
export function mountLoader(root: HTMLElement, message = ""): void {
  root.innerHTML = LOADER;
  const problem = root.querySelector("#problem");
  if (problem) problem.textContent = message;
  const input = root.querySelector<HTMLInputElement>("#file");
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      mountTown(root, parseTown(await file.text()));
    } catch (error) {
      mountLoader(root, error instanceof Error ? error.message : "That file could not be read");
    }
  });
}
