import { describe, expect, it } from 'vitest';
import { levelFromXp, levelProgress, xpForLevel } from './level';

describe('level', () => {
  it('uses cumulative thresholds 50*L*(L-1)', () => {
    expect([1, 2, 3, 4, 10].map(xpForLevel)).toEqual([0, 100, 300, 600, 4500]);
  });
  it('derives level from total XP', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(299)).toBe(2);
    expect(levelFromXp(300)).toBe(3);
  });
  it('reports progress inside the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, current: 0, needed: 100 });
    expect(levelProgress(350)).toEqual({ level: 3, current: 50, needed: 300 });
  });
});
