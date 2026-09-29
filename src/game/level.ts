export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  return { level, current: xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) };
}
