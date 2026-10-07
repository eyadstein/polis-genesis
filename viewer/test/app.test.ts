import { beforeEach, describe, expect, it } from "vitest";
import { mountLoader, mountTown } from "../src/app";
import { makeTown } from "./fixtures";

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById("app") as HTMLElement;
});

function click(selector: string): void {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("the viewer", () => {
  it("shows the summary, four tabs and the town map first", () => {
    mountTown(root, makeTown());
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(root.querySelector('[aria-selected="true"]')?.textContent).toBe("Town map");
    expect(root.querySelectorAll(".dot")).toHaveLength(5);
    const gini = [...root.querySelectorAll(".summary div")].find((d) => d.querySelector("dt")?.textContent === "Inequality (Gini)");
    expect(gini?.querySelector("dd")?.textContent).toBe("0.61");
  });

  it("opens a person from the map and shows their words and family", () => {
    mountTown(root, makeTown());
    click('.dot[data-select="2"]');
    const detail = root.querySelector("#detail") as HTMLElement;
    expect(detail.textContent).toContain("Cara");
    expect(detail.textContent).toContain("You are Person2");
    expect(detail.textContent).toContain("Amal");
    expect(detail.textContent).toContain("Dov");
  });

  it("follows a family link to another person", () => {
    mountTown(root, makeTown());
    click('.dot[data-select="2"]');
    click('#detail [data-select="0"]');
    expect((root.querySelector("#detail h2") as HTMLElement).textContent).toBe("Amal");
  });

  it("says so when someone has died", () => {
    const state = mountTown(root, makeTown());
    click('[data-tab="people"]');
    const alive = root.querySelector("#alive") as HTMLInputElement;
    alive.checked = false;
    alive.dispatchEvent(new Event("change", { bubbles: true }));
    click('#people-rows [data-select="5"]');
    expect(state.selected).toBe(5);
    expect((root.querySelector("#detail") as HTMLElement).textContent).toContain("has died");
  });

  it("switches tabs and keeps the tab state in sync", () => {
    mountTown(root, makeTown());
    click('[data-tab="charts"]');
    expect(root.querySelector('[aria-selected="true"]')?.textContent).toBe("Charts");
    expect(root.querySelectorAll("svg[role=img]").length).toBeGreaterThanOrEqual(5);
    click('[data-tab="talk"]');
    expect(root.querySelectorAll(".talk li")).toHaveLength(2);
  });

  it("lists people and filters them as you type", () => {
    mountTown(root, makeTown());
    click('[data-tab="people"]');
    expect(root.querySelectorAll("#people-rows tr")).toHaveLength(5);
    const query = root.querySelector("#query") as HTMLInputElement;
    query.value = "esra";
    query.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelectorAll("#people-rows tr")).toHaveLength(1);
    query.value = "nobody by this name";
    query.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector("#people-rows")?.textContent).toContain("Nobody matches");
  });

  it("sorts when a column heading is chosen, and flips on a second choice", () => {
    mountTown(root, makeTown());
    click('[data-tab="people"]');
    const firstName = () => root.querySelector("#people-rows tr th")?.textContent;
    click('[data-sort="name"]');
    expect(firstName()).toBe("Amal");
    click('[data-sort="name"]');
    expect(firstName()).toBe("Esra");
  });

  it("recolors the map when the color choice changes", () => {
    mountTown(root, makeTown());
    const before = root.querySelector(".dot")?.getAttribute("fill");
    const job = root.querySelector('input[value="job"]') as HTMLInputElement;
    job.checked = true;
    job.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector(".dot")?.getAttribute("fill")).not.toBe(before);
  });

  it("moves between tabs with the arrow keys", () => {
    mountTown(root, makeTown());
    const first = root.querySelector('[data-tab="map"]') as HTMLElement;
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(root.querySelector('[aria-selected="true"]')?.textContent).toBe("People");
  });

  it("never lets a name inject markup", () => {
    const evil = makeTown();
    evil.people[0] = { ...evil.people[0]!, name: `<script>boom()</script>`, voice: `<b>x</b>` };
    mountTown(root, evil);
    click('[data-tab="people"]');
    click('#people-rows [data-select="0"]');
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("#detail b")).toBeNull();
  });

  it("gives every control a name for screen readers", () => {
    mountTown(root, makeTown());
    click('[data-tab="people"]');
    for (const el of root.querySelectorAll("input, select")) {
      const labelled = el.closest("label") !== null || el.getAttribute("aria-label") !== null;
      expect(labelled).toBe(true);
    }
    expect(root.querySelector("table")).not.toBeNull();
    expect(root.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0);
  });

  it("shows a file picker when no town is loaded, with any problem in plain words", () => {
    mountLoader(root, "That file is not valid JSON");
    expect(root.querySelector("#file")).not.toBeNull();
    expect(root.querySelector("#problem")?.textContent).toBe("That file is not valid JSON");
  });
});
