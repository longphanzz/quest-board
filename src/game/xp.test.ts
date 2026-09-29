import { describe, expect, it } from 'vitest';
import { calculateXp, getTiming } from './xp';

describe('getTiming', () => {
  it('is none without a deadline', () => expect(getTiming(null, '2026-09-29')).toBe('none'));
  it('is early on or before the deadline', () => {
    expect(getTiming('2026-09-29', '2026-09-29')).toBe('early');
    expect(getTiming('2026-10-01', '2026-09-29')).toBe('early');
  });
  it('is late after the deadline', () => expect(getTiming('2026-09-28', '2026-09-29')).toBe('late'));
});

describe('calculateXp', () => {
  it.each([
    ['normal', 'none', 0, 25],
    ['hard', 'early', 0, 75],
    ['easy', 'late', 0, 5],
    ['boss', 'early', 10, 225],
    ['boss', 'none', 20, 150], // streak bonus capped at 10 days
    ['normal', 'early', 1, 39], // 39.375 rounds down
    ['normal', 'late', 1, 13], // 13.125
    ['normal', 'none', 1, 26], // 26.25
  ] as const)('%s / %s / streak %i → %i XP', (difficulty, timing, streak, expected) => {
    expect(calculateXp(difficulty, timing, streak)).toBe(expected);
  });
});
