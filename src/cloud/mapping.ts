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

const fit = (text: string, max: number, fallback: string) => text.trim().slice(0, max) || fallback;

/** Normalizes data the database would reject (old imports, dangling label ids) instead of failing every sync. */
export function toCloudBoard(data: AppData): CloudBoard {
  const labels = data.labels.map((l) => ({ ...l, name: fit(l.name, MAX_LABEL_NAME_LENGTH, 'Label') }));
  const labelIds = new Set(labels.map((l) => l.id));
  const quests = Object.fromEntries(
    Object.entries(data.quests).map(([id, q]) => [
      id,
      {
        ...q,
        title: fit(q.title, MAX_TITLE_LENGTH, 'Untitled quest'),
        labelIds: [...new Set(q.labelIds)].filter((l) => labelIds.has(l)),
      },
    ]),
  );
  return {
    columns: data.columns.map((c) => ({ ...c, name: fit(c.name, MAX_COLUMN_NAME_LENGTH, 'Column') })),
    quests,
    labels,
    player: data.player,
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
