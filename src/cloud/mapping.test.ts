import { describe, expect, it } from 'vitest';
import { fromCloudBoard, toCloudBoard } from './mapping';
import { T0, columnId, emptyBoard, withQuest } from '../test/fixtures';
import type { AppData } from '../types';

function richBoard(): AppData {
  let data = emptyBoard(T0);
  data = { ...data, labels: [{ id: 'l1', name: 'School', color: '#41a6f6' }, { id: 'l2', name: 'Home', color: '#ef7d57' }] };
  data = withQuest(data, 'To Do', { id: 'q1', title: 'Ôn thi', labelIds: ['l2', 'l1'], deadline: '2026-10-05' });
  data = withQuest(data, 'Done', {
    id: 'q2', difficulty: 'boss',
    completion: { at: '2026-09-30T08:15:00.000Z', xp: 150, difficulty: 'boss', early: true },
  });
  data.player = {
    ...data.player, totalXp: 150, streak: 2, lastActiveDate: '2026-09-30', shields: 1,
    stats: { completed: 1, bossesSlain: 1, earlyFinishes: 1 },
    unlockedAchievements: { 'first-blood': '2026-09-30T08:15:00.000Z' },
  };
  data.avatar = { frames: { ...data.avatar.frames, happy: Array(1024).fill('#ffcd75') } };
  return data;
}

describe('toCloudBoard', () => {
  it('drops settings and schemaVersion', () => {
    const cloud = toCloudBoard(richBoard()) as unknown as Record<string, unknown>;
    expect(Object.keys(cloud).sort()).toEqual(['avatar', 'columns', 'labels', 'player', 'quests']);
  });

  it('removes label ids that point at missing labels and duplicates', () => {
    const data = richBoard();
    data.quests.q1 = { ...data.quests.q1, labelIds: ['l1', 'gone', 'l1'] };
    expect(toCloudBoard(data).quests.q1.labelIds).toEqual(['l1']);
  });

  it('clamps over-long or empty names so the database accepts them', () => {
    const data = richBoard();
    data.quests.q1 = { ...data.quests.q1, title: 'x'.repeat(200) };
    data.columns[0] = { ...data.columns[0], name: '   ' };
    data.labels[0] = { ...data.labels[0], name: 'y'.repeat(50) };
    const cloud = toCloudBoard(data);
    expect(cloud.quests.q1.title).toHaveLength(120);
    expect(cloud.columns[0].name).toBe('Column');
    expect(cloud.labels[0].name).toHaveLength(20);
  });
});

describe('fromCloudBoard', () => {
  it('round-trips a board exactly, taking settings from the device', () => {
    const data = richBoard();
    const settings = { ...data.settings, theme: 'light' as const };
    const result = fromCloudBoard(JSON.parse(JSON.stringify(toCloudBoard(data))), settings);
    expect(result).toEqual({ ok: true, data: { ...data, settings } });
  });

  it('rejects malformed boards', () => {
    expect(fromCloudBoard(null, emptyBoard().settings).ok).toBe(false);
    expect(fromCloudBoard({ columns: 'nope' }, emptyBoard().settings).ok).toBe(false);
  });

  it('keeps the column order and quest order', () => {
    const data = withQuest(richBoard(), 'To Do', { id: 'q3' });
    const back = fromCloudBoard(toCloudBoard(data), data.settings);
    expect(back.ok && back.data.columns.find((c) => c.id === columnId(data, 'To Do'))?.questIds).toEqual(['q1', 'q3']);
  });
});
