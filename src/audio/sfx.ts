import { audio, type NoteSpec, type Wave } from './engine';
import { noteToFreq as n } from './notes';

export type SfxName = 'create' | 'drop' | 'complete' | 'uncomplete' | 'levelUp' | 'achievement' | 'boss';

function seq(wave: Wave, notes: string[], step: number, gain: number, last: number, offset = 0): NoteSpec[] {
  return notes.map((note, i) => ({
    wave,
    freq: n(note),
    start: offset + i * step,
    dur: i === notes.length - 1 ? last : step * 0.95,
    gain,
  }));
}

export const SFX: Record<SfxName, NoteSpec[]> = {
  // "sword drawn": a noise swish and a rising ping
  create: [
    { wave: 'noise', freq: 0, start: 0, dur: 0.07, gain: 0.18 },
    { wave: 'pulse25', freq: n('E6'), start: 0.04, dur: 0.08, gain: 0.18, slideTo: n('B6') },
  ],
  // "footsteps"
  drop: [
    { wave: 'triangle', freq: n('C4'), start: 0, dur: 0.045, gain: 0.35 },
    { wave: 'triangle', freq: n('G3'), start: 0.07, dur: 0.045, gain: 0.35 },
  ],
  // "chest opens": rising Gmaj7 run
  complete: seq('pulse50', ['G4', 'B4', 'D5', 'F#5', 'G5'], 0.075, 0.22, 0.3),
  uncomplete: seq('triangle', ['D5', 'A4', 'D4'], 0.09, 0.3, 0.18),
  levelUp: [
    ...seq('pulse50', ['D5', 'F#5', 'A5', 'D6'], 0.1, 0.22, 0.35),
    ...seq('pulse50', ['C#6', 'E6', 'D6'], 0.12, 0.22, 0.7, 0.72),
    ...seq('triangle', ['D3', 'A3', 'D4'], 0.35, 0.35, 0.8),
  ],
  // "secret found" sparkle with an echo
  achievement: [
    ...seq('pulse12', ['E6', 'G#6', 'B6', 'E7'], 0.06, 0.16, 0.25),
    ...seq('pulse12', ['E6', 'G#6', 'B6', 'E7'], 0.06, 0.06, 0.25, 0.12),
  ],
  boss: [
    ...seq('pulse50', ['A4', 'C#5', 'E5', 'A5'], 0.09, 0.22, 0.2),
    ...seq('pulse50', ['G5', 'A5', 'B5', 'C#6', 'E6'], 0.08, 0.22, 0.6, 0.45),
    ...seq('triangle', ['A2', 'E3', 'A3'], 0.3, 0.35, 0.7),
  ],
};

export function playSfx(name: SfxName): void {
  audio.play(SFX[name], 'sfx');
}
