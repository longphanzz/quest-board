import { describe, expect, it } from 'vitest';
import { applyActivity, displayedStreak, isStreakBroken, type StreakState } from './streak';

const s = (streak: number, lastActiveDate: string | null, shields = 0): StreakState => ({ streak, lastActiveDate, shields });
const TODAY = '2026-09-29';

describe('applyActivity', () => {
  it('starts a streak on the first activity', () => {
    expect(applyActivity(s(0, null), TODAY)).toEqual(s(1, TODAY));
  });
  it('does nothing on a second activity the same day', () => {
    expect(applyActivity(s(3, TODAY, 1), TODAY)).toEqual(s(3, TODAY, 1));
  });
  it('extends on consecutive days, across months', () => {
    expect(applyActivity(s(3, '2026-09-28'), TODAY)).toEqual(s(4, TODAY));
    expect(applyActivity(s(2, '2026-09-30'), '2026-10-01')).toEqual(s(3, '2026-10-01'));
  });
  it('resets after a missed day without shields', () => {
    expect(applyActivity(s(5, '2026-09-27'), TODAY)).toEqual(s(1, TODAY));
  });
  it('spends shields to cover missed days', () => {
    expect(applyActivity(s(5, '2026-09-27', 1), TODAY)).toEqual(s(6, TODAY, 0));
    expect(applyActivity(s(5, '2026-09-26', 2), TODAY)).toEqual(s(6, TODAY, 0));
  });
  it('resets but keeps shields when there are not enough to cover the gap', () => {
    expect(applyActivity(s(5, '2026-09-26', 1), TODAY)).toEqual(s(1, TODAY, 1));
  });
  it('earns a shield every 7 days, capped at 2', () => {
    expect(applyActivity(s(6, '2026-09-28'), TODAY)).toEqual(s(7, TODAY, 1));
    expect(applyActivity(s(13, '2026-09-28', 2), TODAY)).toEqual(s(14, TODAY, 2));
  });
  it('ignores activity dated before the last active day (clock moved back)', () => {
    expect(applyActivity(s(4, '2026-09-30', 1), TODAY)).toEqual(s(4, '2026-09-30', 1));
  });
});

describe('displayedStreak / isStreakBroken', () => {
  it('shows 0 before any activity', () => {
    expect(displayedStreak(s(0, null), TODAY)).toBe(0);
    expect(isStreakBroken(s(0, null), TODAY)).toBe(false);
  });
  it('keeps the streak while it can still be continued today', () => {
    expect(displayedStreak(s(4, '2026-09-28'), TODAY)).toBe(4);
    expect(displayedStreak(s(4, TODAY), TODAY)).toBe(4);
  });
  it('keeps the streak when shields cover the gap', () => {
    expect(displayedStreak(s(4, '2026-09-26', 2), TODAY)).toBe(4);
    expect(isStreakBroken(s(4, '2026-09-26', 2), TODAY)).toBe(false);
  });
  it('shows 0 once the gap exceeds the shields', () => {
    expect(displayedStreak(s(4, '2026-09-26', 1), TODAY)).toBe(0);
    expect(isStreakBroken(s(4, '2026-09-26', 1), TODAY)).toBe(true);
  });
  it('is not broken when the clock moved back', () => {
    expect(isStreakBroken(s(4, '2026-10-02'), TODAY)).toBe(false);
  });
});
