import type { AppData, AvatarFrames, Column, DateKey, Difficulty, Frame, GameEvent, Label, Quest, Result } from '../types';
import { createAvatar, newId } from './defaults';
import { completeQuest, finalize } from './progress';

export const MAX_TITLE_LENGTH = 120;
export const MAX_COLUMN_NAME_LENGTH = 30;
export const MAX_LABEL_NAME_LENGTH = 20;

export interface QuestInput {
  title: string;
  description?: string;
  difficulty?: Difficulty;
  deadline?: DateKey | null;
  labelIds?: string[];
}
export type QuestPatch = Partial<Pick<Quest, 'title' | 'description' | 'difficulty' | 'deadline' | 'labelIds'>>;

const unchanged = (data: AppData): Result => ({ data, events: [] });
const fail = (data: AppData, error: string): Result => ({ data, events: [], error });
const clean = (raw: string, max: number): string | null => {
  const text = raw.trim();
  return text ? text.slice(0, max) : null;
};

export function addQuest(data: AppData, columnId: string, input: QuestInput, now: Date): Result {
  const title = clean(input.title, MAX_TITLE_LENGTH);
  if (!title) return fail(data, 'Quest title cannot be empty.');
  const column = data.columns.find((c) => c.id === columnId);
  if (!column) return fail(data, 'That column no longer exists.');

  const quest: Quest = {
    id: newId(),
    title,
    description: input.description ?? '',
    difficulty: input.difficulty ?? 'normal',
    deadline: input.deadline ?? null,
    labelIds: input.labelIds ?? [],
    createdAt: now.toISOString(),
    completion: null,
  };
  let next: AppData = {
    ...data,
    quests: { ...data.quests, [quest.id]: quest },
    columns: data.columns.map((c) => (c.id === columnId ? { ...c, questIds: [...c.questIds, quest.id] } : c)),
  };
  let events: GameEvent[] = [];
  if (column.isDone) ({ data: next, events } = completeQuest(next, quest.id, now));
  return { ...finalize(next, events, now), createdId: quest.id };
}

export function updateQuest(data: AppData, questId: string, patch: QuestPatch, now: Date): Result {
  const quest = data.quests[questId];
  if (!quest) return fail(data, 'That quest no longer exists.');
  const next: Quest = { ...quest, ...patch };
  if (patch.title !== undefined) {
    const title = clean(patch.title, MAX_TITLE_LENGTH);
    if (!title) return fail(data, 'Quest title cannot be empty.');
    next.title = title;
  }
  return finalize({ ...data, quests: { ...data.quests, [questId]: next } }, [], now);
}

export function deleteQuest(data: AppData, questId: string, now: Date): Result {
  if (!data.quests[questId]) return unchanged(data);
  const quests = { ...data.quests };
  delete quests[questId];
  const columns = data.columns.map((c) => ({ ...c, questIds: c.questIds.filter((id) => id !== questId) }));
  return finalize({ ...data, quests, columns }, [], now);
}

/** Quests in the Done column, top to bottom. */
export function doneQuests(data: AppData): Quest[] {
  const done = data.columns.find((c) => c.isDone);
  return (done?.questIds ?? []).map((id) => data.quests[id]).filter((q): q is Quest => Boolean(q));
}

/** Tidies the board: removes every quest in Done. XP, level and achievements are kept. */
export function clearDoneQuests(data: AppData, now: Date): Result {
  const cleared = new Set(doneQuests(data).map((q) => q.id));
  if (cleared.size === 0) return unchanged(data);
  const quests = Object.fromEntries(Object.entries(data.quests).filter(([id]) => !cleared.has(id)));
  const columns = data.columns.map((c) => (c.isDone ? { ...c, questIds: [] } : c));
  return finalize({ ...data, quests, columns }, [], now);
}

/** Undo for clearDoneQuests: puts the quests back at the top of the current Done column. */
export function restoreQuests(data: AppData, quests: Quest[], now: Date): Result {
  const missing = quests.filter((q) => !data.quests[q.id]);
  if (missing.length === 0) return unchanged(data);
  const ids = missing.map((q) => q.id);
  return finalize({
    ...data,
    quests: { ...data.quests, ...Object.fromEntries(missing.map((q) => [q.id, q])) },
    columns: data.columns.map((c) => (c.isDone ? { ...c, questIds: [...ids, ...c.questIds] } : c)),
  }, [], now);
}

export function addColumn(data: AppData, name: string): Result {
  const column: Column = { id: newId(), name: clean(name, MAX_COLUMN_NAME_LENGTH) ?? 'New Column', questIds: [], isDone: false };
  return { data: { ...data, columns: [...data.columns, column] }, events: [], createdId: column.id };
}

export function renameColumn(data: AppData, columnId: string, name: string): Result {
  const clean_ = clean(name, MAX_COLUMN_NAME_LENGTH);
  if (!clean_) return fail(data, 'Column name cannot be empty.');
  return unchanged({ ...data, columns: data.columns.map((c) => (c.id === columnId ? { ...c, name: clean_ } : c)) });
}

export function deleteColumn(data: AppData, columnId: string, now: Date): Result {
  const column = data.columns.find((c) => c.id === columnId);
  if (!column) return unchanged(data);
  if (column.isDone) return fail(data, 'Pick another Done column before deleting this one.');
  const target = data.columns.find((c) => c.id !== columnId && !c.isDone);
  if (column.questIds.length > 0 && !target) {
    return fail(data, 'Add another column first — these quests need somewhere to go.');
  }
  const columns = data.columns
    .filter((c) => c.id !== columnId)
    .map((c) => (c.id === target?.id ? { ...c, questIds: [...c.questIds, ...column.questIds] } : c));
  return finalize({ ...data, columns }, [], now);
}

export function setDoneColumn(data: AppData, columnId: string): Result {
  if (!data.columns.some((c) => c.id === columnId)) return unchanged(data);
  return unchanged({ ...data, columns: data.columns.map((c) => ({ ...c, isDone: c.id === columnId })) });
}

export function moveColumn(data: AppData, from: number, to: number): Result {
  const n = data.columns.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return unchanged(data);
  const columns = [...data.columns];
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved);
  return unchanged({ ...data, columns });
}

export function addLabel(data: AppData, name: string, color: string): Result {
  const clean_ = clean(name, MAX_LABEL_NAME_LENGTH);
  if (!clean_) return fail(data, 'Label name cannot be empty.');
  const label: Label = { id: newId(), name: clean_, color };
  return { data: { ...data, labels: [...data.labels, label] }, events: [], createdId: label.id };
}

export function deleteLabel(data: AppData, labelId: string): Result {
  const quests: Record<string, Quest> = {};
  for (const [id, q] of Object.entries(data.quests)) {
    quests[id] = q.labelIds.includes(labelId) ? { ...q, labelIds: q.labelIds.filter((l) => l !== labelId) } : q;
  }
  return unchanged({ ...data, labels: data.labels.filter((l) => l.id !== labelId), quests });
}

const isBlank = (frame: Frame | null): boolean => !frame || frame.every((c) => c === null);

export function saveAvatar(data: AppData, frames: AvatarFrames, now: Date): Result {
  const normalized: AvatarFrames = {
    normal: isBlank(frames.normal) ? null : frames.normal,
    happy: isBlank(frames.happy) ? null : frames.happy,
    levelUp: isBlank(frames.levelUp) ? null : frames.levelUp,
    sad: isBlank(frames.sad) ? null : frames.sad,
  };
  return finalize({ ...data, avatar: { frames: normalized } }, [], now);
}

export function resetAvatar(data: AppData): Result {
  return unchanged({ ...data, avatar: createAvatar() });
}
