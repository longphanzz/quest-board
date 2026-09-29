export interface AchievementContext {
  completed: number;
  bossesSlain: number;
  earlyFinishes: number;
  streak: number;
  level: number;
  hasCustomNormal: boolean;
  customFrames: number;
  openQuests: number;
  overdueQuests: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-blood', name: 'First Blood', description: 'Complete your first quest.', icon: '⚔️', check: (c) => c.completed >= 1 },
  { id: 'boss-slayer', name: 'Boss Slayer', description: 'Defeat a Boss quest.', icon: '💀', check: (c) => c.bossesSlain >= 1 },
  { id: 'boss-hunter', name: 'Boss Hunter', description: 'Defeat 10 Boss quests.', icon: '👑', check: (c) => c.bossesSlain >= 10 },
  { id: 'on-fire', name: 'On Fire', description: 'Reach a 7-day streak.', icon: '🔥', check: (c) => c.streak >= 7 },
  { id: 'unstoppable', name: 'Unstoppable', description: 'Reach a 30-day streak.', icon: '☄️', check: (c) => c.streak >= 30 },
  { id: 'early-bird', name: 'Early Bird', description: 'Finish 10 quests before their deadline.', icon: '🐦', check: (c) => c.earlyFinishes >= 10 },
  { id: 'centurion', name: 'Centurion', description: 'Complete 100 quests.', icon: '💯', check: (c) => c.completed >= 100 },
  { id: 'level-10', name: 'Hero Rank', description: 'Reach level 10.', icon: '🛡️', check: (c) => c.level >= 10 },
  { id: 'level-25', name: 'Legend Rank', description: 'Reach level 25.', icon: '🌟', check: (c) => c.level >= 25 },
  { id: 'artist', name: 'Artist', description: 'Draw your own avatar.', icon: '🎨', check: (c) => c.hasCustomNormal },
  { id: 'full-wardrobe', name: 'Full Wardrobe', description: 'Draw all 4 avatar moods.', icon: '👕', check: (c) => c.customFrames >= 4 },
  { id: 'clean-slate', name: 'Clean Slate', description: 'Have 5+ open quests and none overdue.', icon: '🧹', check: (c) => c.openQuests >= 5 && c.overdueQuests === 0 },
];

export function findNewAchievements(ctx: AchievementContext, unlocked: Record<string, string>): string[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(ctx)).map((a) => a.id);
}
