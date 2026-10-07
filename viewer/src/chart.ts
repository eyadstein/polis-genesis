import type { HistoryPoint } from "./types";
import type { Bucket } from "./stats";

export function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface Series {
  label: string;
  color: string;
  values: number[];
}

const W = 520;
const H = 220;
const PAD = { left: 44, right: 12, top: 14, bottom: 26 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = value / power;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * power;
}

/** A line chart as SVG text, with a text summary for screen readers. */
export function lineChart(title: string, xs: number[], series: Series[]): string {
  const maxValue = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const maxX = Math.max(1, ...xs);
  const x = (v: number) => PAD.left + (v / maxX) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / maxValue) * (H - PAD.top - PAD.bottom);
  const summary = series
    .map((s) => `${s.label} ends at ${s.values.at(-1) ?? 0}`)
    .join(", ");
  const lines = series
    .map((s) => {
      const points = s.values.map((v, i) => `${x(xs[i] ?? 0).toFixed(1)},${y(v).toFixed(1)}`);
      return `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${points.join(" ")}" />`;
    })
    .join("");
  const ticks = [0, 0.5, 1]
    .map((t) => {
      const v = maxValue * t;
      return `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="grid" /><text x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${Number(v.toFixed(2))}</text>`;
    })
    .join("");
  const legend = series
    .map(
      (s, i) =>
        `<text x="${PAD.left + i * 130}" y="${H - 6}" class="tick" fill="${s.color}">${esc(s.label)}</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}. ${esc(summary)}">${ticks}${lines}${legend}</svg>`;
}

/** The chart for a field of the history, one line per field. */
export function historyChart(
  title: string,
  history: HistoryPoint[],
  fields: Array<{ key: keyof HistoryPoint; label: string; color: string }>,
): string {
  return lineChart(
    title,
    history.map((h) => h.tick),
    fields.map((f) => ({ label: f.label, color: f.color, values: history.map((h) => Number(h[f.key])) })),
  );
}

/** A bar chart of how many people fall in each bucket. */
export function barChart(title: string, buckets: Bucket[], color: string): string {
  const maxCount = niceMax(Math.max(0, ...buckets.map((b) => b.count)));
  const slot = (W - PAD.left - PAD.right) / Math.max(1, buckets.length);
  const bars = buckets
    .map((b, i) => {
      const height = (b.count / maxCount) * (H - PAD.top - PAD.bottom);
      const left = PAD.left + i * slot + 3;
      return `<rect x="${left.toFixed(1)}" y="${(H - PAD.bottom - height).toFixed(1)}" width="${(slot - 6).toFixed(1)}" height="${height.toFixed(1)}" fill="${color}"><title>${esc(b.label)}: ${b.count} people</title></rect><text x="${(left + (slot - 6) / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="tick">${esc(b.label)}</text>`;
    })
    .join("");
  const summary = buckets.map((b) => `${b.label}: ${b.count}`).join(", ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}. ${esc(summary)}">${bars}</svg>`;
}
