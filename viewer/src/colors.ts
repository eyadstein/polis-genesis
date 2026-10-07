/** Colors and the contrast checks behind them. */

export interface Theme {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  alert: string;
}

export const LIGHT: Theme = {
  background: "#f4f1ea",
  surface: "#fbfaf6",
  ink: "#1d1b17",
  muted: "#57534a",
  line: "#d8d2c4",
  accent: "#1c5a56",
  alert: "#9a3f27",
};

export const DARK: Theme = {
  background: "#17150f",
  surface: "#1f1c15",
  ink: "#eee9dc",
  muted: "#b4ad9c",
  line: "#3a3629",
  accent: "#6cc1ba",
  alert: "#f08c70",
};

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** One color per job, chosen to be told apart at a glance. */
export const JOB_COLORS: Record<string, string> = {
  Farmer: "#5a7d2a",
  Builder: "#b0702a",
  Mechanic: "#2f6f9a",
  Shopkeeper: "#8d4f8a",
  Officer: "#33478f",
  Judge: "#8a2f3d",
  Lawyer: "#2a7d6f",
};

export const NO_JOB_COLOR = "#8a8577";

export function jobColor(job: string | null): string {
  return job === null ? NO_JOB_COLOR : (JOB_COLORS[job] ?? NO_JOB_COLOR);
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const part = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${part(0)}, ${part(1)}, ${part(2)})`;
}

/** The map is always drawn on this paper color, in light and dark themes. */
export const MAP_BACKGROUND = "#f4f1ea";

/** From ochre (poorest) to deep teal (richest). The input is a rank from 0 to 1. */
export function wealthColor(rank: number): string {
  const t = Math.min(1, Math.max(0, rank));
  return mix([176, 128, 40], [16, 70, 66], t);
}

/** From brick (low) through olive (uneasy) to green (happy). Mood runs from -1 to 1. */
export function moodColor(mood: number): string {
  const t = Math.min(1, Math.max(-1, mood));
  return t < 0
    ? mix([150, 128, 60], [154, 63, 39], -t)
    : mix([150, 128, 60], [47, 107, 58], t);
}
