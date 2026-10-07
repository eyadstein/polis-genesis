import { esc } from "./chart";
import { JOB_COLORS, NO_JOB_COLOR, jobColor, moodColor, wealthColor } from "./colors";
import { living } from "./stats";
import type { Person, Town } from "./types";

export type MapMode = "wealth" | "mood" | "job";

export const CELL = 10;
const DISTRICTS_PER_SIDE = 4;

/** Where each living person ranks by savings, from 0 (poorest) to 1 (richest). */
export function wealthRanks(people: Person[]): Map<number, number> {
  const order = [...people].sort((a, b) => a.money - b.money || a.id - b.id);
  const ranks = new Map<number, number>();
  order.forEach((p, i) => ranks.set(p.id, order.length > 1 ? i / (order.length - 1) : 0));
  return ranks;
}

function dotColor(person: Person, mode: MapMode, ranks: Map<number, number>): string {
  if (mode === "mood") return moodColor(person.mood);
  if (mode === "job") return jobColor(person.job);
  return wealthColor(ranks.get(person.id) ?? 0);
}

/** The town as SVG: districts shaded by appeal, and one dot per living person. */
export function mapSvg(town: Town, mode: MapMode, selected: number | null): string {
  const w = town.width * CELL;
  const h = town.height * CELL;
  const cellW = w / DISTRICTS_PER_SIDE;
  const cellH = h / DISTRICTS_PER_SIDE;
  const districts = town.districts
    .map((d) => {
      const col = d.id % DISTRICTS_PER_SIDE;
      const row = Math.floor(d.id / DISTRICTS_PER_SIDE);
      const shade = (0.04 + 0.22 * d.appeal).toFixed(3);
      return `<g><rect x="${col * cellW}" y="${row * cellH}" width="${cellW}" height="${cellH}" class="district" style="--shade:${shade}" /><text x="${col * cellW + 6}" y="${row * cellH + 15}" class="district-label">District ${d.id}, rent ${d.mean_rent.toFixed(1)}</text></g>`;
    })
    .join("");
  const people = living(town);
  const ranks = wealthRanks(people);
  const dots = people
    .map((p) => {
      const chosen = p.id === selected;
      const radius = chosen ? 6 : p.adult ? 3.4 : 2.4;
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      const ring = chosen ? ` stroke="currentColor" stroke-width="2.5"` : ` stroke="rgba(0,0,0,0.35)" stroke-width="0.6"`;
      return `<circle class="dot" data-select="${p.id}" cx="${cx}" cy="${cy}" r="${radius}" fill="${dotColor(p, mode, ranks)}"${ring}><title>${esc(p.name)}</title></circle>`;
    })
    .join("");
  const label = `Map of the town with ${people.length} living people, colored by ${mode}`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${districts}${dots}</svg>`;
}

/** What the colors on the map mean. */
export function legend(mode: MapMode): string {
  if (mode === "wealth") {
    return `<p class="legend"><span class="swatch" style="background:${wealthColor(0)}"></span> poorest <span class="swatch" style="background:${wealthColor(0.5)}"></span> middle <span class="swatch" style="background:${wealthColor(1)}"></span> richest. Smaller dots are children.</p>`;
  }
  if (mode === "mood") {
    return `<p class="legend"><span class="swatch" style="background:${moodColor(-1)}"></span> low <span class="swatch" style="background:${moodColor(0)}"></span> uneasy <span class="swatch" style="background:${moodColor(1)}"></span> happy. Smaller dots are children.</p>`;
  }
  const items = Object.entries(JOB_COLORS)
    .map(([job, color]) => `<span class="swatch" style="background:${color}"></span> ${esc(job)}`)
    .join(" ");
  return `<p class="legend">${items} <span class="swatch" style="background:${NO_JOB_COLOR}"></span> no job. Smaller dots are children.</p>`;
}
