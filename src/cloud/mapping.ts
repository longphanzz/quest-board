import type { AppData, AvatarFrames, Column, Label, Player, Quest, Settings } from '../types';
import { validateData, type ImportResult } from '../store/persistence';
import { MAX_COLUMN_NAME_LENGTH, MAX_LABEL_NAME_LENGTH, MAX_TITLE_LENGTH } from '../store/board';

/** The synced part of AppData; settings are per device and never leave it. */
export interface CloudBoard {
  columns: Column[];
  quests: Record<string, Quest>;
  labels: Label[];
  player: Player;
  avatar: { frames: AvatarFrames };
}

/** Shortens by code points, so an emoji is never cut in half (Postgres rejects lone surrogates). */
const fit = (text: string, max: number, fallback: string) =>
  Array.from(text.trim()).slice(0, max).join('') || fallback;

const EPOCH = new Date(0).toISOString();
const int = (n: number) => Math.max(0, Math.round(n));
/** A timestamp Postgres accepts, in the canonical form Date.toISOString() produces. */
const iso = (text: string, fallback: string) => {
  const t = Date.parse(text);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
};
/** A real calendar day (rejects 2026-02-30), else null. */
const day = (text: string | null): string | null => {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? text : null;
};

/** Normalizes data the database would reject (old imports, hand-edited backups) instead of failing every sync. */
export function toCloudBoard(data: AppData): CloudBoard {
  const seen = new Set<string>();
  const labels = data.labels
    .filter((l) => !seen.has(l.id) && seen.add(l.id))
    .map((l) => ({ ...l, name: fit(l.name, MAX_LABEL_NAME_LENGTH, 'Label'), color: fit(l.color, 32, '#94b0c2') }));
  const quests = Object.fromEntries(
    Object.entries(data.quests).map(([id, q]) => {
      const createdAt = iso(q.createdAt, EPOCH);
      return [
        id,
        {
          ...q,
          title: fit(q.title, MAX_TITLE_LENGTH, 'Untitled quest'),
          deadline: day(q.deadline),
          createdAt,
          labelIds: [...new Set(q.labelIds)].filter((l) => seen.has(l)),
          completion: q.completion && { ...q.completion, xp: int(q.completion.xp), at: iso(q.completion.at, createdAt) },
        },
      ];
    }),
  );
  const p = data.player;
  return {
    columns: data.columns.map((c) => ({ ...c, name: fit(c.name, MAX_COLUMN_NAME_LENGTH, 'Column') })),
    quests,
    labels,
    player: {
      ...p,
      totalXp: int(p.totalXp),
      streak: int(p.streak),
      shields: int(p.shields),
      lastActiveDate: day(p.lastActiveDate),
      stats: { completed: int(p.stats.completed), bossesSlain: int(p.stats.bossesSlain), earlyFinishes: int(p.stats.earlyFinishes) },
      unlockedAchievements: Object.fromEntries(
        Object.entries(p.unlockedAchievements).map(([id, at]) => [id, iso(at, EPOCH)]),
      ),
    },
    avatar: { frames: data.avatar.frames },
  };
}

export function fromCloudBoard(board: unknown, settings: Settings): ImportResult {
  if (typeof board !== 'object' || board === null || Array.isArray(board)) {
    return { ok: false, error: 'The board from the server is damaged.' };
  }
  const result = validateData({ ...board, schemaVersion: 1, settings });
  return result.ok ? { ok: true, data: { ...result.data, settings } } : result;
}
