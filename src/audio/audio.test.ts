import { describe, expect, it } from 'vitest';
import { noteToFreq } from './notes';
import { SFX, playSfx } from './sfx';
import { CHORD_TONES, SONG, STEPS_PER_BAR, barNotes, parseLead } from './music';

describe('noteToFreq', () => {
  it('maps note names to equal-tempered frequencies', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440);
    expect(noteToFreq('A5')).toBeCloseTo(880);
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteToFreq('F#5')).toBeCloseTo(739.99, 1);
  });
  it('throws on bad names', () => expect(() => noteToFreq('H2')).toThrow());
});

describe('SFX', () => {
  it('has valid notes for every effect', () => {
    for (const notes of Object.values(SFX)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.start).toBeGreaterThanOrEqual(0);
        expect(n.dur).toBeGreaterThan(0);
        if (n.wave !== 'noise') expect(n.freq).toBeGreaterThan(20);
      }
    }
  });
  it('is silent (no throw) without Web Audio support', () => {
    expect(() => playSfx('complete')).not.toThrow();
  });
});

describe('music', () => {
  it('has 16 bars of exactly 8 eighth-note steps with known chords', () => {
    expect(SONG).toHaveLength(16);
    for (const bar of SONG) {
      expect(parseLead(bar.lead).reduce((sum, s) => sum + s.steps, 0)).toBe(STEPS_PER_BAR);
      expect(CHORD_TONES[bar.chord]).toBeDefined();
    }
  });
  it('renders every bar to playable notes', () => {
    for (let i = 0; i < SONG.length; i++) {
      for (const n of barNotes(i)) {
        expect(Number.isFinite(n.freq)).toBe(true);
        expect(n.dur).toBeGreaterThan(0);
      }
    }
  });
});
