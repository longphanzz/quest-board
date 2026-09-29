import type { DateKey, Difficulty } from '../types';

export const BASE_XP: Record<Difficulty, number> = { easy: 10, normal: 25, hard: 50, boss: 100 };
export type Timing = 'none' | 'early' | 'late';
export const TIMING_MULTIPLIER: Record<Timing, number> = { none: 1, early: 1.5, late: 0.5 };
export const MAX_STREAK_BONUS_DAYS = 10;
export const STREAK_BONUS_PER_DAY = 0.05;

export function getTiming(deadline: DateKey | null, completedOn: DateKey): Timing {
  if (!deadline) return 'none';
  return completedOn <= deadline ? 'early' : 'late';
}

export function calculateXp(difficulty: Difficulty, timing: Timing, streak: number): number {
  const bonusDays = Math.min(Math.max(streak, 0), MAX_STREAK_BONUS_DAYS);
  const streakMultiplier = 1 + STREAK_BONUS_PER_DAY * bonusDays;
  return Math.round(BASE_XP[difficulty] * TIMING_MULTIPLIER[timing] * streakMultiplier);
}
