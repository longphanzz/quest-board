import { audio, type NoteSpec } from './engine';
import { noteToFreq } from './notes';

export const BPM = 112;
export const STEP = 60 / BPM / 2; // one eighth note
export const STEPS_PER_BAR = 8;

export const CHORD_TONES: Record<string, string[]> = {
  F: ['F4', 'A4', 'C5', 'E5'],
  G: ['G4', 'B4', 'D5', 'B4'],
  Em: ['E4', 'G4', 'B4', 'G4'],
  Am: ['A4', 'C5', 'E5', 'C5'],
  Dm: ['D4', 'F4', 'A4', 'F4'],
  C: ['C4', 'E4', 'G4', 'E4'],
};
const BASS: Record<string, string> = { F: 'F2', G: 'G2', Em: 'E2', Am: 'A2', Dm: 'D2', C: 'C3' };

/** "Meadow Expedition" — original 16-bar loop in F Lydian. Tokens are note:eighths, '-' is a rest. */
export const SONG: { chord: string; lead: string }[] = [
  { chord: 'F', lead: 'C5:2 F5:2 A5:3 G5:1' },
  { chord: 'G', lead: 'B5:4 A5:2 G5:2' },
  { chord: 'Em', lead: 'G5:2 E5:2 B4:4' },
  { chord: 'Am', lead: 'C5:2 E5:2 A5:4' },
  { chord: 'F', lead: 'A5:2 C6:2 B5:2 A5:2' },
  { chord: 'G', lead: 'G5:3 D5:1 B4:4' },
  { chord: 'C', lead: 'C5:2 E5:2 G5:2 E5:2' },
  { chord: 'C', lead: 'C5:6 -:2' },
  { chord: 'F', lead: 'F5:2 A5:2 C6:3 B5:1' },
  { chord: 'G', lead: 'B5:2 D6:2 B5:2 G5:2' },
  { chord: 'Em', lead: 'E5:2 G5:2 B5:4' },
  { chord: 'Am', lead: 'A5:3 G5:1 E5:4' },
  { chord: 'Dm', lead: 'D5:2 F5:2 A5:2 F5:2' },
  { chord: 'G', lead: 'G5:2 B5:2 D6:4' },
  { chord: 'C', lead: 'E6:2 D6:2 C6:2 G5:2' },
  { chord: 'G', lead: 'B5:4 -:4' },
];

export interface LeadStep { note: string | null; steps: number; }

export function parseLead(lead: string): LeadStep[] {
  return lead.trim().split(/\s+/).map((token) => {
    const [note, length] = token.split(':');
    return { note: note === '-' ? null : note, steps: Number(length) };
  });
}

export function barNotes(index: number): NoteSpec[] {
  const bar = SONG[index % SONG.length];
  const notes: NoteSpec[] = [];
  let pos = 0;
  for (const step of parseLead(bar.lead)) {
    if (step.note) {
      notes.push({ wave: 'pulse25', freq: noteToFreq(step.note), start: pos * STEP, dur: step.steps * STEP * 0.92, gain: 0.22 });
    }
    pos += step.steps;
  }
  const tones = CHORD_TONES[bar.chord];
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    notes.push({ wave: 'pulse12', freq: noteToFreq(tones[i % tones.length]), start: i * STEP, dur: STEP * 0.8, gain: 0.07 });
    if (i % 2 === 0) notes.push({ wave: 'noise', freq: 0, start: i * STEP, dur: 0.03, gain: 0.04 });
  }
  const root = noteToFreq(BASS[bar.chord]);
  notes.push(
    { wave: 'triangle', freq: root, start: 0, dur: STEP * 3, gain: 0.35 },
    { wave: 'triangle', freq: root * 2, start: STEP * 4, dur: STEP * 2, gain: 0.3 },
    { wave: 'triangle', freq: root, start: STEP * 6, dur: STEP * 2, gain: 0.3 },
  );
  return notes;
}

const LOOKAHEAD = 1.2;

export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar = 0;
  private nextTime = 0;

  start(): void {
    if (this.timer) return;
    const ctx = audio.ensure();
    if (!ctx) return;
    this.bar = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    audio.resetMusicBus();
  }

  private tick(): void {
    const ctx = audio.ensure();
    if (!ctx) return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05; // after a suspend/resume
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      audio.play(barNotes(this.bar), 'music', this.nextTime);
      this.nextTime += STEP * STEPS_PER_BAR;
      this.bar = (this.bar + 1) % SONG.length;
    }
  }
}

export const music = new MusicPlayer();
