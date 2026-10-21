/**
 * Procedural Town Soundscape and Water Acoustics.
 * Generates natural ambient sound and water flow without external audio assets.
 */

export class TownSoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private active = false;

  public toggle(): boolean {
    if (this.active) {
      this.stop();
      return false;
    }
    this.start();
    return true;
  }

  public isRunning(): boolean {
    return this.active;
  }

  public start(): void {
    if (this.active) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupWaterSynth(this.ctx, this.masterGain);
      this.setupWindSynth(this.ctx, this.masterGain);
      this.active = true;
    } catch {
      this.active = false;
    }
  }

  public stop(): void {
    if (!this.active || !this.ctx) return;
    try {
      void this.ctx.close();
    } catch {
      // ignore close errors
    }
    this.ctx = null;
    this.active = false;
  }

  public updateLight(isNight: boolean): void {
    if (!this.ctx || !this.windGain) return;
    const target = isNight ? 0.03 : 0.06;
    this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.0);
  }

  private setupWaterSynth(ctx: AudioContext, destination: GainNode): void {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let last = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (last + 0.02 * white) / 1.02;
      last = output[i] ?? 0;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(540, ctx.currentTime);
    filter.Q.setValueAtTime(1.8, ctx.currentTime);

    this.waterGain = ctx.createGain();
    this.waterGain.gain.setValueAtTime(0.35, ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.waterGain);
    this.waterGain.connect(destination);
    whiteNoise.start();
  }

  private setupWindSynth(ctx: AudioContext, destination: GainNode): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, ctx.currentTime);

    this.windGain = ctx.createGain();
    this.windGain.gain.setValueAtTime(0.04, ctx.currentTime);

    osc.connect(this.windGain);
    this.windGain.connect(destination);
    osc.start();
  }
}
