import type { AppData, Avatar, Player, Quest, Settings } from '../types';

export const LABEL_COLORS = ['#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#41a6f6', '#3b5dc9', '#5d275d'] as const;

let fallbackCounter = 0;

/** crypto.randomUUID only exists in secure contexts (https / localhost). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  fallbackCounter += 1;
  return `id-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSettings(now: Date): Settings {
  return {
    sfxVolume: 0.6,
    musicVolume: 0.4,
    musicOn: false,
    muted: false,
    theme: 'dark',
    lastExportAt: null,
    installedAt: now.toISOString(),
    backupSnoozedUntil: null,
  };
}

export function createPlayer(): Player {
  return {
    totalXp: 0,
    streak: 0,
    lastActiveDate: null,
    shields: 0,
    stats: { completed: 0, bossesSlain: 0, earlyFinishes: 0 },
    unlockedAchievements: {},
  };
}

export function createAvatar(): Avatar {
  return { frames: { normal: null, happy: null, levelUp: null, sad: null } };
}

export function createDefaultData(now: Date = new Date()): AppData {
  const welcome: Quest = {
    id: newId(),
    title: 'Welcome, hero! Drag me to Done',
    description:
      'Create quests with "+ New Quest", pick a difficulty and a deadline, then drag them across the board. Finishing quests in the Done column earns XP!',
    difficulty: 'easy',
    deadline: null,
    labelIds: [],
    createdAt: now.toISOString(),
    completion: null,
  };
  return {
    schemaVersion: 1,
    columns: [
      { id: newId(), name: 'To Do', questIds: [welcome.id], isDone: false },
      { id: newId(), name: 'Doing', questIds: [], isDone: false },
      { id: newId(), name: 'Done', questIds: [], isDone: true },
    ],
    quests: { [welcome.id]: welcome },
    labels: [],
    player: createPlayer(),
    avatar: createAvatar(),
    settings: createSettings(now),
  };
}
