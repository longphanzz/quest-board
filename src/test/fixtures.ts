import type { AppData, Quest } from '../types';
import { createDefaultData } from '../store/defaults';

export const T0 = new Date(2026, 8, 29, 10, 0); // 2026-09-29 local

export function at(dayOffset: number, hour = 10): Date {
  return new Date(2026, 8, 29 + dayOffset, hour, 0);
}

export function makeQuest(partial: Partial<Quest> & { id: string }): Quest {
  return {
    title: `Quest ${partial.id}`,
    description: '',
    difficulty: 'normal',
    deadline: null,
    labelIds: [],
    createdAt: T0.toISOString(),
    completion: null,
    ...partial,
  };
}

export function emptyBoard(now: Date = T0): AppData {
  const data = createDefaultData(now);
  return { ...data, quests: {}, columns: data.columns.map((c) => ({ ...c, questIds: [] })) };
}

export function columnId(data: AppData, name: string): string {
  const column = data.columns.find((c) => c.name === name);
  if (!column) throw new Error(`No column named ${name}`);
  return column.id;
}

export function withQuest(data: AppData, columnName: string, partial: Partial<Quest> & { id: string }): AppData {
  const quest = makeQuest(partial);
  const target = columnId(data, columnName);
  return {
    ...data,
    quests: { ...data.quests, [quest.id]: quest },
    columns: data.columns.map((c) => (c.id === target ? { ...c, questIds: [...c.questIds, quest.id] } : c)),
  };
}
