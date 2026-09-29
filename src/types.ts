export type Difficulty = 'easy' | 'normal' | 'hard' | 'boss';
export type DateKey = string; // 'YYYY-MM-DD', local time
export type Mood = 'normal' | 'happy' | 'levelUp' | 'sad';
export type Frame = (string | null)[]; // 32*32 = 1024 cells, '#rrggbb' or null
export type Theme = 'dark' | 'light';

export const MOODS: Mood[] = ['normal', 'happy', 'levelUp', 'sad'];

export interface Completion {
  at: string; // ISO
  xp: number;
  difficulty: Difficulty; // difficulty at completion time
  early: boolean; // finished on or before the deadline
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  deadline: DateKey | null;
  labelIds: string[];
  createdAt: string;
  completion: Completion | null;
}

export interface Column { id: string; name: string; questIds: string[]; isDone: boolean; }
export interface Label { id: string; name: string; color: string; }

export interface PlayerStats { completed: number; bossesSlain: number; earlyFinishes: number; }
export interface Player {
  totalXp: number;
  streak: number;
  lastActiveDate: DateKey | null;
  shields: number;
  stats: PlayerStats;
  unlockedAchievements: Record<string, string>; // id -> ISO time
}

export type AvatarFrames = Record<Mood, Frame | null>;
export interface Avatar { frames: AvatarFrames; }

export interface Settings {
  sfxVolume: number;
  musicVolume: number;
  musicOn: boolean;
  muted: boolean;
  theme: Theme;
  lastExportAt: string | null;
  installedAt: string;
  backupSnoozedUntil: string | null;
}

export interface AppData {
  schemaVersion: 1;
  columns: Column[];
  quests: Record<string, Quest>;
  labels: Label[];
  player: Player;
  avatar: Avatar;
  settings: Settings;
}

export type GameEvent =
  | { type: 'questCompleted'; questId: string; xp: number; difficulty: Difficulty }
  | { type: 'questUncompleted'; questId: string; xp: number }
  | { type: 'levelUp'; level: number }
  | { type: 'achievement'; id: string };

export interface Result {
  data: AppData;
  events: GameEvent[];
  error?: string;
  createdId?: string;
}
