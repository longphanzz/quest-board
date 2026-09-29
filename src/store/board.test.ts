import { describe, expect, it } from 'vitest';
import type { AppData, Frame } from '../types';
import {
  addColumn, addLabel, addQuest, deleteColumn, deleteLabel, deleteQuest, moveColumn,
  renameColumn, resetAvatar, saveAvatar, setDoneColumn, updateQuest,
} from './board';
import { moveQuest } from './progress';
import { T0, columnId, emptyBoard, withQuest } from '../test/fixtures';

const blank = (): Frame => Array(1024).fill(null);

describe('quests', () => {
  it('adds a trimmed quest with defaults at the end of the column', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'first' });
    const r = addQuest(data, columnId(data, 'To Do'), { title: '  Đánh boss cuối  ' }, T0);
    expect(r.error).toBeUndefined();
    const q = r.data.quests[r.createdId!];
    expect(q.title).toBe('Đánh boss cuối');
    expect(q.difficulty).toBe('normal');
    expect(r.data.columns[0].questIds).toEqual(['first', r.createdId]);
  });

  it('rejects an empty title and leaves data untouched', () => {
    const data = emptyBoard();
    const r = addQuest(data, columnId(data, 'To Do'), { title: '   ' }, T0);
    expect(r.error).toBe('Quest title cannot be empty.');
    expect(r.data).toBe(data);
  });

  it('truncates titles to 120 characters', () => {
    const data = emptyBoard();
    const r = addQuest(data, columnId(data, 'To Do'), { title: 'x'.repeat(200) }, T0);
    expect(r.data.quests[r.createdId!].title).toHaveLength(120);
  });

  it('completes a quest created directly in the Done column', () => {
    const data = emptyBoard();
    const r = addQuest(data, columnId(data, 'Done'), { title: 'Already done' }, T0);
    expect(r.data.quests[r.createdId!].completion).not.toBeNull();
    expect(r.events[0]).toMatchObject({ type: 'questCompleted' });
  });

  it('updates fields but never changes awarded XP', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'q' });
    data = moveQuest(data, 'q', columnId(data, 'Done'), 0, T0).data;
    const r = updateQuest(data, 'q', { difficulty: 'boss', title: 'Renamed' }, T0);
    expect(r.data.quests.q.title).toBe('Renamed');
    expect(r.data.player.totalXp).toBe(data.player.totalXp);
    expect(updateQuest(data, 'q', { title: '  ' }, T0).error).toBe('Quest title cannot be empty.');
  });

  it('keeps XP when a completed quest is deleted', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'q' });
    data = moveQuest(data, 'q', columnId(data, 'Done'), 0, T0).data;
    const r = deleteQuest(data, 'q', T0);
    expect(r.data.quests.q).toBeUndefined();
    expect(r.data.columns.every((c) => !c.questIds.includes('q'))).toBe(true);
    expect(r.data.player.totalXp).toBe(26);
  });
});

describe('columns', () => {
  it('adds a column with a default name', () => {
    const r = addColumn(emptyBoard(), '   ');
    expect(r.data.columns.at(-1)!.name).toBe('New Column');
    expect(r.createdId).toBe(r.data.columns.at(-1)!.id);
  });

  it('renames, rejecting empty names', () => {
    const data = emptyBoard();
    expect(renameColumn(data, columnId(data, 'Doing'), 'In Battle').data.columns[1].name).toBe('In Battle');
    expect(renameColumn(data, columnId(data, 'Doing'), ' ').error).toBe('Column name cannot be empty.');
  });

  it('refuses to delete the Done column', () => {
    const data = emptyBoard();
    expect(deleteColumn(data, columnId(data, 'Done'), T0).error).toBe('Pick another Done column before deleting this one.');
  });

  it('moves quests of a deleted column to the first non-Done column', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    data = withQuest(data, 'Doing', { id: 'b' });
    const r = deleteColumn(data, columnId(data, 'Doing'), T0);
    expect(r.data.columns.map((c) => c.name)).toEqual(['To Do', 'Done']);
    expect(r.data.columns[0].questIds).toEqual(['a', 'b']);
  });

  it('refuses to delete the only non-Done column while it holds quests', () => {
    let data: AppData = emptyBoard();
    data = { ...data, columns: data.columns.filter((c) => c.name !== 'Doing') };
    data = withQuest(data, 'To Do', { id: 'a' });
    const r = deleteColumn(data, columnId(data, 'To Do'), T0);
    expect(r.error).toBe('Add another column first — these quests need somewhere to go.');
    expect(r.data.quests.a).toBeDefined();
  });

  it('switches the Done column so exactly one is Done', () => {
    const data = emptyBoard();
    const r = setDoneColumn(data, columnId(data, 'Doing'));
    expect(r.data.columns.filter((c) => c.isDone).map((c) => c.name)).toEqual(['Doing']);
  });

  it('reorders columns', () => {
    const r = moveColumn(emptyBoard(), 0, 2);
    expect(r.data.columns.map((c) => c.name)).toEqual(['Doing', 'Done', 'To Do']);
    expect(moveColumn(emptyBoard(), 0, 9).data.columns.map((c) => c.name)).toEqual(['To Do', 'Doing', 'Done']);
  });
});

describe('labels', () => {
  it('adds and deletes labels, removing them from quests', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'q' });
    const added = addLabel(data, ' Học ', '#41a6f6');
    const labelId = added.createdId!;
    data = updateQuest(added.data, 'q', { labelIds: [labelId] }, T0).data;
    const r = deleteLabel(data, labelId);
    expect(r.data.labels).toEqual([]);
    expect(r.data.quests.q.labelIds).toEqual([]);
    expect(addLabel(data, ' ', '#fff').error).toBe('Label name cannot be empty.');
  });
});

describe('avatar', () => {
  it('stores blank frames as null', () => {
    const r = saveAvatar(emptyBoard(), { normal: blank(), happy: null, levelUp: blank(), sad: null }, T0);
    expect(r.data.avatar.frames).toEqual({ normal: null, happy: null, levelUp: null, sad: null });
  });
  it('unlocks Artist when a normal frame is drawn, and resets', () => {
    const drawn = blank();
    drawn[0] = '#1a1c2c';
    const r = saveAvatar(emptyBoard(), { normal: drawn, happy: null, levelUp: null, sad: null }, T0);
    expect(r.events).toContainEqual({ type: 'achievement', id: 'artist' });
    expect(resetAvatar(r.data).data.avatar.frames.normal).toBeNull();
  });
});
