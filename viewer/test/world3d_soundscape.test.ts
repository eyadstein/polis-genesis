import { describe, expect, it } from "vitest";
import { TownSoundscape } from "../src/world3d/soundscape";

describe("TownSoundscape", () => {
  it("initializes in inactive state and toggles safely", () => {
    const s = new TownSoundscape();
    expect(s.isRunning()).toBe(false);
    // In node/jsdom without WebAudio mock it handles absence gracefully
    const active = s.toggle();
    expect(typeof active).toBe("boolean");
    s.stop();
    expect(s.isRunning()).toBe(false);
  });
});
