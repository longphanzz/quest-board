import { describe, expect, it } from 'vitest';
import { deadlineInfo, isOverdue } from './deadline';

const today = '2026-09-29';

describe('deadlineInfo', () => {
  it.each([
    ['2026-09-29', 'today!', false, true],
    ['2026-09-30', 'tomorrow', false, false],
    ['2026-10-02', '3 days', false, false],
    ['2026-09-28', '1 day late', true, false],
    ['2026-09-26', '3 days late', true, false],
  ])('%s → %s', (deadline, text, overdue, dueToday) => {
    expect(deadlineInfo(deadline, today)).toEqual({ text, overdue, dueToday });
  });
});

describe('isOverdue', () => {
  it('only counts unfinished quests past their deadline', () => {
    expect(isOverdue({ deadline: '2026-09-28', completion: null }, today)).toBe(true);
    expect(isOverdue({ deadline: '2026-09-29', completion: null }, today)).toBe(false);
    expect(isOverdue({ deadline: null, completion: null }, today)).toBe(false);
    expect(
      isOverdue({ deadline: '2026-09-28', completion: { at: '', xp: 1, difficulty: 'easy', early: false } }, today),
    ).toBe(false);
  });
});
