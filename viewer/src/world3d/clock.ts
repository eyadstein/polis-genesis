/** Game time: one tick is one hour, so a day is 24 ticks. */

export const TICKS_PER_DAY = 24;

export interface ClockParts {
  day: number;
  hour: number;
  minute: number;
}

export function clockParts(tick: number): ClockParts {
  const t = Math.max(0, tick);
  const day = Math.floor(t / TICKS_PER_DAY) + 1;
  const minutes = Math.floor(((t % TICKS_PER_DAY) / TICKS_PER_DAY) * 24 * 60);
  return { day, hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

export function clockLabel(tick: number): string {
  const { day, hour, minute } = clockParts(tick);
  return `Day ${day}  ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 1 in full daylight, 0 in the dead of night, soft at dawn and dusk. */
export function daylight(tick: number): number {
  const hour = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const sun = Math.cos(((hour - 12) / 24) * Math.PI * 2);
  return smoothstep(-0.2, 0.3, sun);
}

/** Sun angle in radians: 0 at sunrise, pi/2 at noon, pi at sunset. */
export function sunAngle(tick: number): number {
  const hour = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return ((hour - 6) / 12) * Math.PI;
}

export function phaseName(tick: number): "Night" | "Dawn or dusk" | "Day" {
  const d = daylight(tick);
  if (d < 0.1) return "Night";
  if (d < 0.9) return "Dawn or dusk";
  return "Day";
}

/** Play, pause, speed, skip and rewind over a range of ticks. */
export class SimClock {
  tick: number;
  speed = 2; // ticks per real second, negative runs backward
  playing = false;

  constructor(
    readonly min: number,
    readonly max: number,
    start: number = min,
  ) {
    this.tick = Math.min(max, Math.max(min, start));
  }

  seek(tick: number): void {
    this.tick = Math.min(this.max, Math.max(this.min, tick));
  }

  skip(delta: number): void {
    this.seek(this.tick + delta);
  }

  togglePlay(): void {
    if (this.playing) {
      this.playing = false;
      return;
    }
    if (this.speed > 0 && this.tick >= this.max) this.seek(this.min);
    if (this.speed < 0 && this.tick <= this.min) this.seek(this.max);
    this.playing = true;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  advance(seconds: number): void {
    if (!this.playing) return;
    this.seek(this.tick + this.speed * seconds);
    if ((this.speed > 0 && this.tick >= this.max) || (this.speed < 0 && this.tick <= this.min)) {
      this.playing = false;
    }
  }
}
