import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SYNC, useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import { runAgent, runTool } from './agent';

const getSession = vi.fn(async () => ({ data: { session: { access_token: 'tok' } } }));
vi.mock('../cloud/client', () => ({ getSupabase: () => ({ auth: { getSession } }) }));
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const reply = (message: unknown) => ({ ok: true, json: async () => ({ message }) });
const sentBody = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

const app = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC }, lastCleared: null });
  fetchMock.mockReset();
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
    fetchMock
      .mockResolvedValueOnce(reply({ role: 'assistant', content: null, tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'add_quest', arguments: JSON.stringify({ columnId: todo, title: 'Plank 1 phút' }) } },
      ] }))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Đã thêm!' }));

    const out = await runAgent([{ role: 'user', content: 'thêm plank' }]);
    expect(out).toEqual([{ role: 'user', content: 'thêm plank' }, { role: 'assistant', content: 'Đã thêm!' }]);
    expect(Object.values(app().data.quests).some((q) => q.title === 'Plank 1 phút')).toBe(true);
    expect(sentBody(1).messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'c1' }));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('only completes a quest when the user approves', async () => {
    const [todo, , done] = app().data.columns;
    const questId = todo.questIds[0];
    const moveCall = { role: 'assistant', content: null, tool_calls: [
      { id: 'm1', type: 'function', function: { name: 'move_quest', arguments: JSON.stringify({ questId, toColumnId: done.id }) } },
    ] };
    fetchMock.mockResolvedValueOnce(reply(moveCall)).mockResolvedValueOnce(reply({ role: 'assistant', content: 'OK' }));
    await runAgent([{ role: 'user', content: 'xong rồi' }]); // no confirm callback = declined
    expect(app().data.quests[questId].completion).toBeNull();
    expect(sentBody(1).messages.at(-1).content).toMatch(/declined/);

    const confirm = vi.fn(async () => true);
    fetchMock.mockResolvedValueOnce(reply(moveCall)).mockResolvedValueOnce(reply({ role: 'assistant', content: 'OK' }));
    await runAgent([{ role: 'user', content: 'xong rồi' }], confirm);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/complete/));
    expect(app().data.quests[questId].completion).not.toBeNull();
  });

  it('throws when the function fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(runAgent([{ role: 'user', content: 'hi' }])).rejects.toThrow();
  });

  it('asks the user to sign in instead of calling without a token', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } } as never);
    await expect(runAgent([{ role: 'user', content: 'hi' }])).rejects.toThrow(/sign in/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
