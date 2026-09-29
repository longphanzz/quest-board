export type Wave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle' | 'noise';
export type Bus = 'sfx' | 'music';

export interface NoteSpec {
  wave: Wave;
  freq: number;
  start: number; // seconds after the play() base time
  dur: number;
  gain?: number;
  slideTo?: number;
}

const DUTY = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 } as const;
type PulseWave = keyof typeof DUTY;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private waves = new Map<PulseWave, PeriodicWave>();
  private noise: AudioBuffer | null = null;
  private volumes = { sfx: 0.6, music: 0.4, muted: false };

  ensure(): AudioContext | null {
    if (!this.ctx) {
      const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Ctor = typeof g.AudioContext === 'function' ? g.AudioContext : g.webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(ctx.destination);
      this.musicBus = this.createMusicBus(ctx);
      this.applyVolumes();
    }
    this.resume();
    return this.ctx;
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(sfx: number, music: number, muted: boolean): void {
    this.volumes = { sfx, music, muted };
    this.applyVolumes();
  }

  /** Cuts off already-scheduled music immediately. */
  resetMusicBus(): void {
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.disconnect();
    this.musicBus = this.createMusicBus(this.ctx);
    this.applyVolumes();
  }

  play(notes: NoteSpec[], bus: Bus, at?: number): void {
    if (this.volumes.muted) return;
    const ctx = this.ensure();
    const out = bus === 'sfx' ? this.sfxBus : this.musicBus;
    if (!ctx || !out) return;
    const base = at ?? ctx.currentTime + 0.01;
    for (const note of notes) this.voice(ctx, out, note, base + note.start);
  }

  private createMusicBus(ctx: AudioContext): GainNode {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    return gain;
  }

  private applyVolumes(): void {
    if (!this.sfxBus || !this.musicBus) return;
    const on = this.volumes.muted ? 0 : 1;
    this.sfxBus.gain.value = this.volumes.sfx * on;
    this.musicBus.gain.value = this.volumes.music * 0.5 * on;
  }

  private voice(ctx: AudioContext, out: GainNode, n: NoteSpec, t: number): void {
    const peak = n.gain ?? 0.3;
    const end = t + n.dur;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.005);
    env.gain.setValueAtTime(peak, Math.max(t + 0.005, end - 0.03));
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(out);

    let src: AudioScheduledSourceNode;
    if (n.wave === 'noise') {
      const buffer = ctx.createBufferSource();
      buffer.buffer = this.noiseBuffer(ctx);
      src = buffer;
    } else {
      const osc = ctx.createOscillator();
      if (n.wave === 'triangle') osc.type = 'triangle';
      else osc.setPeriodicWave(this.pulse(ctx, n.wave));
      osc.frequency.setValueAtTime(n.freq, t);
      if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, end);
      src = osc;
    }
    src.connect(env);
    src.start(t);
    src.stop(end + 0.02);
    src.onended = () => env.disconnect();
  }

  private pulse(ctx: AudioContext, wave: PulseWave): PeriodicWave {
    const cached = this.waves.get(wave);
    if (cached) return cached;
    const harmonics = 64;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let k = 1; k < harmonics; k++) real[k] = (2 * Math.sin(Math.PI * k * DUTY[wave])) / (Math.PI * k);
    const periodic = ctx.createPeriodicWave(real, imag);
    this.waves.set(wave, periodic);
    return periodic;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }
}

export const audio = new AudioEngine();
