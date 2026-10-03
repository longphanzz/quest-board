import type { AppData, AvatarFrames, Column, Frame, Label, Player, Quest, Settings } from '../types';
import { MOODS } from '../types';
import { toDateKey } from '../game/dates';
import { createSettings } from './defaults';
import { MAX_SHIELDS } from '../game/streak';

export type ImportResult = { ok: true; data: AppData } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const DAMAGED: ImportResult = { ok: false, error: 'This backup file is damaged or incomplete.' };
const DIFFICULTIES = ['easy', 'normal', 'hard', 'boss'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isNullableStr = (v: unknown): v is string | null => v === null || isStr(v);

function isQuest(v: unknown): v is Quest {
  if (!isObj(v)) return false;
  const c = v.completion;
  const completionOk =
    c === null ||
    (isObj(c) && isStr(c.at) && isNum(c.xp) && DIFFICULTIES.includes(c.difficulty as string) && isBool(c.early));
  return (
    isStr(v.id) && isStr(v.title) && isStr(v.description) &&
    DIFFICULTIES.includes(v.difficulty as string) &&
    (v.deadline === null || (isStr(v.deadline) && DATE_RE.test(v.deadline))) &&
    isStrArr(v.labelIds) && isStr(v.createdAt) && completionOk
  );
}

const isColumn = (v: unknown): v is Column =>
  isObj(v) && isStr(v.id) && isStr(v.name) && isStrArr(v.questIds) && isBool(v.isDone);

const isLabel = (v: unknown): v is Label => isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.color);

function isPlayer(v: unknown): v is Player {
  if (!isObj(v) || !isObj(v.stats) || !isObj(v.unlockedAchievements)) return false;
  const s = v.stats;
  return (
    isNum(v.totalXp) && v.totalXp >= 0 && isNum(v.streak) && v.streak >= 0 && isNullableStr(v.lastActiveDate) &&
    isNum(v.shields) && v.shields >= 0 && v.shields <= MAX_SHIELDS &&
    [s.completed, s.bossesSlain, s.earlyFinishes].every((n) => isNum(n) && n >= 0) &&
    Object.values(v.unlockedAchievements).every(isStr)
  );
}

const isFrame = (v: unknown): v is Frame | null =>
  v === null || (Array.isArray(v) && v.length === 1024 && v.every((c) => c === null || isStr(c)));

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function pickSettings(s: Obj): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (isNum(s.sfxVolume)) out.sfxVolume = clamp01(s.sfxVolume);
  if (isNum(s.musicVolume)) out.musicVolume = clamp01(s.musicVolume);
  if (isBool(s.musicOn)) out.musicOn = s.musicOn;
  if (isBool(s.muted)) out.muted = s.muted;
  if (s.theme === 'dark' || s.theme === 'light') out.theme = s.theme;
  if (isNullableStr(s.lastExportAt)) out.lastExportAt = s.lastExportAt;
  if (isStr(s.installedAt)) out.installedAt = s.installedAt;
  if (isNullableStr(s.backupSnoozedUntil)) out.backupSnoozedUntil = s.backupSnoozedUntil;
  return out;
}

export function validateData(raw: unknown, now: Date = new Date()): ImportResult {
  if (!isObj(raw)) return DAMAGED;
  if (raw.schemaVersion !== 1) {
    return { ok: false, error: 'This backup was made by an unsupported version of Quest Board.' };
  }
  const { columns, quests, labels, player, avatar } = raw;
  if (!Array.isArray(columns) || !columns.every(isColumn)) return DAMAGED;
  if (columns.filter((c) => c.isDone).length !== 1) return DAMAGED;
  if (new Set(columns.map((c) => c.id)).size !== columns.length) return DAMAGED;
  if (!isObj(quests) || !Object.values(quests).every(isQuest)) return DAMAGED;
  const questMap = quests as Record<string, Quest>;
  const placed = columns.flatMap((c) => c.questIds);
  if (new Set(placed).size !== placed.length) return DAMAGED;
  if (!placed.every((id) => questMap[id]?.id === id)) return DAMAGED;
  if (!Array.isArray(labels) || !labels.every(isLabel)) return DAMAGED;
  if (!isPlayer(player)) return DAMAGED;
  if (!isObj(avatar) || !isObj(avatar.frames)) return DAMAGED;
  const rawFrames = avatar.frames;
  if (!MOODS.every((m) => isFrame(rawFrames[m]))) return DAMAGED;

  const placedSet = new Set(placed);
  const keptQuests = Object.fromEntries(Object.entries(questMap).filter(([id]) => placedSet.has(id)));
  const frames = Object.fromEntries(MOODS.map((m) => [m, rawFrames[m] as Frame | null])) as AvatarFrames;
  const settings: Settings = { ...createSettings(now), ...(isObj(raw.settings) ? pickSettings(raw.settings) : {}) };

  return {
    ok: true,
    data: { schemaVersion: 1, columns, quests: keptQuests, labels, player, avatar: { frames }, settings },
  };
}

export function parseBackup(text: string, now: Date = new Date()): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  return validateData(raw, now);
}

export function serialize(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function backupFileName(now: Date): string {
  return `quest-board-backup-${toDateKey(now)}.json`;
}

export function shouldShowBackupReminder(data: AppData, now: Date): boolean {
  if (Object.keys(data.quests).length === 0) return false;
  const { lastExportAt, installedAt, backupSnoozedUntil } = data.settings;
  const t = now.getTime();
  if (backupSnoozedUntil && t < Date.parse(backupSnoozedUntil)) return false;
  if (lastExportAt) return t - Date.parse(lastExportAt) >= 7 * DAY_MS;
  return t - Date.parse(installedAt) >= 3 * DAY_MS;
}
