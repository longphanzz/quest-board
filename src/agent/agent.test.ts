import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SYNC, useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import { runAgent, runTool } from './agent';

const invoke = vi.fn();
vi.mock('../cloud/client', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const app = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC }, lastCleared: null });
  invoke.mockReset();
});

describe('runTool', () => {
  it('adds, edits and moves quests through the store', () => {
    const [todo, , done] = app().data.columns;
    const added = runTool('add_quest', { columnId: todo.id, title: 'Tập gym', difficulty: 'hard', deadline: '2026-10-20' }) as { questId: string };
    const q = () => app().data.quests[added.questId];
    expect(q()).toMatchObject({ title: 'Tập gym', difficulty: 'hard', deadline: '2026-10-20' });

    expect(runTool('edit_quest', { questId: added.questId, title: 'Gym 3 buổi', deadline: null })).toEqual({ ok: true });
    expect(q()).toMatchObject({ title: 'Gym 3 buổi', deadline: null, difficulty: 'hard' });

    expect(runTool('move_quest', { questId: added.questId, toColumnId: done.id })).toEqual({ ok: true });
    expect(app().data.columns[2].questIds.at(-1)).toBe(added.questId);
    expect(q().completion).not.toBeNull();
  });

  it('rejects bad model arguments instead of guessing', () => {
    expect(runTool('edit_quest', { questId: 'nope' })).toEqual({ error: 'Unknown questId' });
    expect(runTool('add_quest', { title: 'x' })).toHaveProperty('error');
    expect(runTool('delete_everything', {})).toHaveProperty('error');
    const id = app().data.columns[0].questIds[0];
    runTool('edit_quest', { questId: id, difficulty: 'legendary', deadline: 'tomorrow' });
    expect(app().data.quests[id].difficulty).not.toBe('legendary');
  });

  it('lists the board with history', () => {
    const snap = runTool('list_board', {}) as { today: string; columns: { quests: unknown[] }[] };
    expect(snap.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snap.columns).toHaveLength(app().data.columns.length);
  });
});

describe('runAgent', () => {
  it('runs tool calls then returns only the visible conversation', async () => {
    const todo = app().data.columns[0].id;
    invoke
      .mockResolvedValueOnce({ data: { message: { role: 'assistant', content: null, tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'add_quest', arguments: JSON.stringify({ columnId: todo, title: 'Plank 1 phút' }) } },
      ] } } })
      .mockResolvedValueOnce({ data: { message: { role: 'assistant', content: 'Đã thêm!' } } });

    const out = await runAgent([{ role: 'user', content: 'thêm plank' }]);
    expect(out).toEqual([{ role: 'user', content: 'thêm plank' }, { role: 'assistant', content: 'Đã thêm!' }]);
    expect(Object.values(app().data.quests).some((q) => q.title === 'Plank 1 phút')).toBe(true);
    expect(invoke.mock.calls[1][1].body.messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'c1' }));
  });

  it('throws when the function fails', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('500') });
    await expect(runAgent([{ role: 'user', content: 'hi' }])).rejects.toThrow();
  });
});
