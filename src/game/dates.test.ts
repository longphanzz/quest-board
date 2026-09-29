import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toDateKey } from './dates';

describe('dates', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
  it('counts days between keys across months and years', () => {
    expect(daysBetween('2026-09-29', '2026-09-29')).toBe(0);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-09-29', '2026-09-26')).toBe(-3);
  });
  it('adds days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
