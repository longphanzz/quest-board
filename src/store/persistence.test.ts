import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { backupFileName, parseBackup, serialize, validateData } from './persistence';
import { T0, emptyBoard, withQuest } from '../test/fixtures';

const clone = (d: AppData) => JSON.parse(JSON.stringify(d));

describe('parseBackup', () => {
  it('round-trips exported data', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'q', title: 'Học tiếng Nhật' });
    const r = parseBackup(serialize(data));
    expect(r).toEqual({ ok: true, data });
  });
  it('rejects invalid JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
  });
  it('rejects other schema versions', () => {
    expect(validateData({ ...clone(emptyBoard()), schemaVersion: 2 })).toEqual({
      ok: false, error: 'This backup was made by an unsupported version of Quest Board.',
    });
  });
  it.each([
    ['two Done columns', (d: any) => { d.columns[0].isDone = true; }],
    ['a column pointing at a missing quest', (d: any) => { d.columns[0].questIds.push('ghost'); }],
    ['a quest listed in two columns', (d: any) => { d.columns[1].questIds.push('q'); }],
    ['a bad difficulty', (d: any) => { d.quests.q.difficulty = 'legendary'; }],
    ['a frame of the wrong size', (d: any) => { d.avatar.frames.normal = [null]; }],
    ['a missing player', (d: any) => { delete d.player; }],
    ['duplicate column ids', (d: any) => { d.columns[1].id = d.columns[0].id; }],
    ['a negative streak', (d: any) => { d.player.streak = -1; }],
    ['too many shields', (d: any) => { d.player.shields = 3; }],
    ['negative stats', (d: any) => { d.player.stats.completed = -2; }],
  ])('rejects %s', (_name, mutate) => {
    const raw = clone(withQuest(emptyBoard(), 'To Do', { id: 'q' }));
    mutate(raw);
    expect(validateData(raw)).toEqual({ ok: false, error: 'This backup file is damaged or incomplete.' });
  });
  it('fills missing or invalid settings with defaults', () => {
    const raw = clone(emptyBoard());
    raw.settings = { theme: 'neon', musicOn: true };
    const r = validateData(raw, T0);
    expect(r.ok && r.data.settings.theme).toBe('dark');
    expect(r.ok && r.data.settings.musicOn).toBe(true);
    expect(r.ok && r.data.settings.sfxVolume).toBe(0.6);
  });
  it('drops quests that are not on any column', () => {
    const raw = clone(emptyBoard());
    raw.quests.orphan = { ...clone(withQuest(emptyBoard(), 'To Do', { id: 'orphan' })).quests.orphan };
    const r = validateData(raw);
    expect(r.ok && r.data.quests.orphan).toBeUndefined();
  });
});

describe('backupFileName', () => {
  it('uses the local date', () => expect(backupFileName(T0)).toBe('quest-board-backup-2026-09-29.json'));
});
