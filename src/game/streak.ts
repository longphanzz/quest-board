import type { DateKey } from '../types';
import { daysBetween } from './dates';

export interface StreakState { streak: number; lastActiveDate: DateKey | null; shields: number; }

export const MAX_SHIELDS = 2;
export const SHIELD_EVERY = 7;

export function applyActivity(state: StreakState, today: DateKey): StreakState {
  const { lastActiveDate } = state;
  if (lastActiveDate !== null && today <= lastActiveDate) return state;

  let { streak, shields } = state;
  if (lastActiveDate === null) {
    streak = 1;
  } else {
    const missed = daysBetween(lastActiveDate, today) - 1;
    if (missed === 0) {
      streak += 1;
    } else if (missed <= shields) {
      shields -= missed;
      streak += 1;
    } else {
      streak = 1;
    }
  }
  if (streak % SHIELD_EVERY === 0) shields = Math.min(shields + 1, MAX_SHIELDS);
  return { streak, lastActiveDate: today, shields };
}

export function isStreakBroken(state: StreakState, today: DateKey): boolean {
  if (state.lastActiveDate === null) return false;
  const missed = daysBetween(state.lastActiveDate, today) - 1;
  return missed > state.shields;
}

export function displayedStreak(state: StreakState, today: DateKey): number {
  if (state.lastActiveDate === null) return 0;
  return isStreakBroken(state, today) ? 0 : state.streak;
}
