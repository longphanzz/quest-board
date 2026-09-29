import type { AppData, GameEvent, Quest, Result } from '../types';
import { toDateKey } from '../game/dates';
import { calculateXp, getTiming } from '../game/xp';
import { levelFromXp } from '../game/level';
import { applyActivity } from '../game/streak';
import { isOverdue } from '../game/deadline';
import { findNewAchievements, type AchievementContext } from '../game/achievements';

export function completeQuest(data: AppData, questId: string, now: Date): Result {
  const quest = data.quests[questId];
  if (!quest || quest.completion) return { data, events: [] };

  const today = toDateKey(now);
  const { player } = data;
  const streak = applyActivity(
    { streak: player.streak, lastActiveDate: player.lastActiveDate, shields: player.shields },
    today,
  );
  const timing = getTiming(quest.deadline, today);
  const xp = calculateXp(quest.difficulty, timing, streak.streak);
  const early = timing === 'early';
  const totalXp = player.totalXp + xp;

  const events: GameEvent[] = [{ type: 'questCompleted', questId, xp, difficulty: quest.difficulty }];
  const after = levelFromXp(totalXp);
  if (after > levelFromXp(player.totalXp)) events.push({ type: 'levelUp', level: after });

  const completed: Quest = { ...quest, completion: { at: now.toISOString(), xp, difficulty: quest.difficulty, early } };
  return {
    data: {
      ...data,
      quests: { ...data.quests, [questId]: completed },
      player: {
        ...player,
        ...streak,
        totalXp,
        stats: {
          completed: player.stats.completed + 1,
          bossesSlain: player.stats.bossesSlain + (quest.difficulty === 'boss' ? 1 : 0),
          earlyFinishes: player.stats.earlyFinishes + (early ? 1 : 0),
        },
      },
    },
    events,
  };
}

export function uncompleteQuest(data: AppData, questId: string): Result {
  const quest = data.quests[questId];
  if (!quest?.completion) return { data, events: [] };
  const { xp, difficulty, early } = quest.completion;
  const { player } = data;
  return {
    data: {
      ...data,
      quests: { ...data.quests, [questId]: { ...quest, completion: null } },
      player: {
        ...player,
        totalXp: Math.max(0, player.totalXp - xp),
        stats: {
          completed: Math.max(0, player.stats.completed - 1),
          bossesSlain: Math.max(0, player.stats.bossesSlain - (difficulty === 'boss' ? 1 : 0)),
          earlyFinishes: Math.max(0, player.stats.earlyFinishes - (early ? 1 : 0)),
        },
      },
    },
    events: [{ type: 'questUncompleted', questId, xp }],
  };
}

export function moveQuest(data: AppData, questId: string, toColumnId: string, toIndex: number, now: Date): Result {
  const quest = data.quests[questId];
  const target = data.columns.find((c) => c.id === toColumnId);
  if (!quest || !target) return { data, events: [] };

  const columns = data.columns.map((c) => ({ ...c, questIds: c.questIds.filter((id) => id !== questId) }));
  const dest = columns.find((c) => c.id === toColumnId)!;
  dest.questIds.splice(Math.max(0, Math.min(toIndex, dest.questIds.length)), 0, questId);

  let result: Result = { data: { ...data, columns }, events: [] };
  if (target.isDone && !quest.completion) result = completeQuest(result.data, questId, now);
  else if (!target.isDone && quest.completion) result = uncompleteQuest(result.data, questId);
  return finalize(result.data, result.events, now);
}

export function buildAchievementContext(data: AppData, now: Date): AchievementContext {
  const today = toDateKey(now);
  const open = Object.values(data.quests).filter((q) => q.completion === null);
  const frames = Object.values(data.avatar.frames);
  return {
    ...data.player.stats,
    streak: data.player.streak,
    level: levelFromXp(data.player.totalXp),
    hasCustomNormal: data.avatar.frames.normal !== null,
    customFrames: frames.filter((f) => f !== null).length,
    openQuests: open.length,
    overdueQuests: open.filter((q) => isOverdue(q, today)).length,
  };
}

export function finalize(data: AppData, events: GameEvent[], now: Date): Result {
  const ids = findNewAchievements(buildAchievementContext(data, now), data.player.unlockedAchievements);
  if (ids.length === 0) return { data, events };
  const stamp = now.toISOString();
  const unlocked = { ...data.player.unlockedAchievements };
  for (const id of ids) unlocked[id] = stamp;
  return {
    data: { ...data, player: { ...data.player, unlockedAchievements: unlocked } },
    events: [...events, ...ids.map((id): GameEvent => ({ type: 'achievement', id }))],
  };
}
