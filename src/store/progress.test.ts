import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { finalize, moveQuest } from './progress';
import { T0, at, columnId, emptyBoard, withQuest } from '../test/fixtures';

const toDone = (data: AppData, id: string, now = T0) => moveQuest(data, id, columnId(data, 'Done'), 0, now);
const toTodo = (data: AppData, id: string, now = T0) => moveQuest(data, id, columnId(data, 'To Do'), 0, now);

describe('moveQuest into Done', () => {
  it('awards XP, starts the streak and unlocks First Blood', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'q1' });
    const { data: next, events } = toDone(data, 'q1');
    expect(next.player.totalXp).toBe(26); // 25 * 1.05 (streak 1)
    expect(next.player.streak).toBe(1);
    expect(next.player.lastActiveDate).toBe('2026-09-29');
    expect(next.player.stats.completed).toBe(1);
    expect(next.quests.q1.completion).toEqual({ at: T0.toISOString(), xp: 26, difficulty: 'normal', early: false });
    expect(events).toEqual([
      { type: 'questCompleted', questId: 'q1', xp: 26, difficulty: 'normal' },
      { type: 'achievement', id: 'first-blood' },
    ]);
    expect(next.player.unlockedAchievements['first-blood']).toBe(T0.toISOString());
  });

  it('halves XP when late and adds 50% when on time', () => {
    const late = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q', deadline: '2026-09-28' }), 'q');
    expect(late.data.player.totalXp).toBe(13);
    const early = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q', deadline: '2026-09-29' }), 'q');
    expect(early.data.player.totalXp).toBe(39);
    expect(early.data.player.stats.earlyFinishes).toBe(1);
  });

  it('emits a single levelUp with the final level on multi-level jumps', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'boss', difficulty: 'boss', deadline: '2026-09-30' });
    data = { ...data, player: { ...data.player, totalXp: 95, streak: 9, lastActiveDate: '2026-09-28' } };
    const { data: next, events } = toDone(data, 'boss');
    expect(next.player.totalXp).toBe(320); // 95 + 100*1.5*1.5
    expect(events.filter((e) => e.type === 'levelUp')).toEqual([{ type: 'levelUp', level: 3 }]);
    expect(next.player.stats.bossesSlain).toBe(1);
  });

  it('does not re-award XP when reordering inside Done', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q1' }), 'q1').data;
    const again = moveQuest(done, 'q1', columnId(done, 'Done'), 5, T0);
    expect(again.data.player.totalXp).toBe(26);
    expect(again.events).toEqual([]);
  });
});

describe('moveQuest out of Done', () => {
  it('removes exactly the awarded XP and stats (no XP farming)', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q1' }), 'q1').data;
    const back = toTodo(done, 'q1');
    expect(back.data.player.totalXp).toBe(0);
    expect(back.data.player.stats.completed).toBe(0);
    expect(back.data.quests.q1.completion).toBeNull();
    expect(back.events).toEqual([{ type: 'questUncompleted', questId: 'q1', xp: 26 }]);
    const redo = toDone(back.data, 'q1');
    expect(redo.data.player.totalXp).toBe(26);
    expect(redo.events.some((e) => e.type === 'achievement')).toBe(false); // First Blood only once
  });

  it('uses the difficulty recorded at completion time', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'b', difficulty: 'boss' }), 'b').data;
    expect(done.player.totalXp).toBe(105);
    const edited: AppData = { ...done, quests: { ...done.quests, b: { ...done.quests.b, difficulty: 'easy' } } };
    const back = toTodo(edited, 'b');
    expect(back.data.player.totalXp).toBe(0);
    expect(back.data.player.stats.bossesSlain).toBe(0);
  });

  it('keeps the streak when un-completing', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q1' }), 'q1').data;
    expect(toTodo(done, 'q1').data.player.streak).toBe(1);
  });
});

describe('moveQuest ordering', () => {
  it('clamps the target index', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    data = withQuest(data, 'To Do', { id: 'b' });
    const next = moveQuest(data, 'a', columnId(data, 'To Do'), 99, T0).data;
    expect(next.columns[0].questIds).toEqual(['b', 'a']);
  });
  it('ignores unknown quests and columns', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    expect(moveQuest(data, 'nope', columnId(data, 'Done'), 0, T0).data).toBe(data);
    expect(moveQuest(data, 'a', 'nope', 0, T0).data).toBe(data);
  });
});

describe('finalize', () => {
  it('unlocks Clean Slate with 5 open quests and none overdue', () => {
    let data = emptyBoard();
    for (const id of ['a', 'b', 'c', 'd', 'e']) data = withQuest(data, 'To Do', { id });
    expect(finalize(data, [], T0).events).toEqual([{ type: 'achievement', id: 'clean-slate' }]);
  });
  it('does not unlock Clean Slate when one quest is overdue', () => {
    let data = emptyBoard();
    for (const id of ['a', 'b', 'c', 'd']) data = withQuest(data, 'To Do', { id });
    data = withQuest(data, 'To Do', { id: 'late', deadline: '2026-09-28' });
    expect(finalize(data, [], at(0)).events).toEqual([]);
  });
});

describe('moveQuest after the Done role moved (review fix)', () => {
  it('does not change XP when reordering inside the column a quest already sits in', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    data = withQuest(data, 'Doing', { id: 'open1' });
    data = withQuest(data, 'Doing', { id: 'open2' });
    data = moveQuest(data, 'a', columnId(data, 'Done'), 0, T0).data;
    data = withQuest(data, 'Done', { id: 'b' });
    const xp = data.player.totalXp;
    // "Doing" becomes the Done column: 'a' stays completed in the old Done, open quests sit in the new Done.
    data = { ...data, columns: data.columns.map((c) => ({ ...c, isDone: c.name === 'Doing' })) };
    const inOldDone = moveQuest(data, 'a', columnId(data, 'Done'), 1, T0);
    expect(inOldDone.data.player.totalXp).toBe(xp);
    expect(inOldDone.data.quests.a.completion).not.toBeNull();
    const inNewDone = moveQuest(data, 'open1', columnId(data, 'Doing'), 1, T0);
    expect(inNewDone.data.player.totalXp).toBe(xp);
    expect(inNewDone.data.quests.open1.completion).toBeNull();
  });
});
