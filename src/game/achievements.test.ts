import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, findNewAchievements, type AchievementContext } from './achievements';

const base: AchievementContext = {
  completed: 0, bossesSlain: 0, earlyFinishes: 0, streak: 0, level: 1,
  hasCustomNormal: false, customFrames: 0, openQuests: 0, overdueQuests: 0,
};

describe('achievements', () => {
  it('defines 12 unique achievements', () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(12);
  });

  it('unlocks nothing for a brand-new player', () => {
    expect(findNewAchievements(base, {})).toEqual([]);
  });

  it.each<[string, Partial<AchievementContext>]>([
    ['first-blood', { completed: 1 }],
    ['boss-slayer', { bossesSlain: 1 }],
    ['boss-hunter', { bossesSlain: 10 }],
    ['on-fire', { streak: 7 }],
    ['unstoppable', { streak: 30 }],
    ['early-bird', { earlyFinishes: 10 }],
    ['centurion', { completed: 100 }],
    ['level-10', { level: 10 }],
    ['level-25', { level: 25 }],
    ['artist', { hasCustomNormal: true, customFrames: 1 }],
    ['full-wardrobe', { hasCustomNormal: true, customFrames: 4 }],
    ['clean-slate', { openQuests: 5, overdueQuests: 0 }],
  ])('unlocks %s', (id, patch) => {
    expect(findNewAchievements({ ...base, ...patch }, {})).toContain(id);
  });

  it('does not unlock clean-slate with an overdue quest', () => {
    expect(findNewAchievements({ ...base, openQuests: 6, overdueQuests: 1 }, {})).not.toContain('clean-slate');
  });

  it('skips achievements that are already unlocked', () => {
    expect(findNewAchievements({ ...base, completed: 1 }, { 'first-blood': '2026-09-29T00:00:00.000Z' })).toEqual([]);
  });
});
