import { describe, expect, it } from "vitest";
import { SimClock, TICKS_PER_DAY, clockLabel, clockParts, daylight, phaseName } from "../src/world3d/clock";

describe("clock", () => {
  it("reads days and hours", () => {
    expect(clockParts(0)).toEqual({ day: 1, hour: 0, minute: 0 });
    expect(clockParts(TICKS_PER_DAY + 6.5)).toEqual({ day: 2, hour: 6, minute: 30 });
    expect(clockLabel(13)).toBe("Day 1  13:00");
  });
  it("is bright at noon and dark at midnight", () => {
    expect(daylight(12)).toBe(1);
    expect(daylight(0)).toBe(0);
    expect(phaseName(0)).toBe("Night");
    expect(phaseName(12)).toBe("Day");
    expect(phaseName(6)).toBe("Dawn or dusk");
  });
  it("plays, pauses, skips and rewinds", () => {
    const c = new SimClock(10, 100, 10);
    c.setSpeed(5);
    c.togglePlay();
    c.advance(2);
    expect(c.tick).toBe(20);
    c.togglePlay();
    c.advance(5);
    expect(c.tick).toBe(20);
    c.skip(-100);
    expect(c.tick).toBe(10);
    c.skip(1000);
    expect(c.tick).toBe(100);
  });
  it("runs backward and stops at the start", () => {
    const c = new SimClock(0, 50, 30);
    c.setSpeed(-10);
    c.togglePlay();
    c.advance(1);
    expect(c.tick).toBe(20);
    c.advance(10);
    expect(c.tick).toBe(0);
    expect(c.playing).toBe(false);
  });
  it("restarts when played at the end", () => {
    const c = new SimClock(0, 50, 50);
    c.togglePlay();
    expect(c.tick).toBe(0);
    expect(c.playing).toBe(true);
  });
});
