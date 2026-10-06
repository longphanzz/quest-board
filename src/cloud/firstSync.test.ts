import { describe, expect, it } from 'vitest';
import { LEGACY_BACKUP_KEY, clearLegacyBoard, decideFirstSync, readLegacyBoard, stashUnsynced, takeUnsynced } from './firstSync';
import { LEGACY_KEY } from '../store/deviceSettings';
import { createDefaultData } from '../store/defaults';

const account = { revision: 3, clientUpdatedAt: 'x', board: {} };

describe('decideFirstSync', () => {
  it.each([
    [null, true, 'ask-upload'],
    [null, false, 'create-default'],
    [account, true, 'ask-replace'],
    [account, false, 'use-account'],
  ] as const)('account=%o legacy=%s → %s', (acc, hasLegacy, expected) => {
    expect(decideFirstSync(acc, hasLegacy ? createDefaultData() : null)).toBe(expected);
  });
});

describe('legacy board', () => {
  it('reads a valid legacy board and clears it', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { data: createDefaultData() }, version: 1 }));
    expect(readLegacyBoard()?.columns).toHaveLength(3);
    clearLegacyBoard();
    expect(readLegacyBoard()).toBeNull();
  });

  it('treats a damaged legacy board as absent', () => {
    localStorage.setItem(LEGACY_KEY, '{nope');
    expect(readLegacyBoard()).toBeNull();
  });
});

describe('review I-4: the legacy board is never destroyed', () => {
  it('clearLegacyBoard keeps a backup copy', () => {
    const raw = JSON.stringify({ state: { data: createDefaultData() }, version: 1 });
    localStorage.setItem(LEGACY_KEY, raw);
    clearLegacyBoard();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_BACKUP_KEY)).toBe(raw);
  });
});

describe('unsynced board stash', () => {
  const sync = { dirty: true, baseRevision: 4, localUpdatedAt: '2026-10-06T01:00:00.000Z' };

  it('gives a stashed board back only to its owner, once', () => {
    const d = createDefaultData();
    d.player.totalXp = 77;
    stashUnsynced('u1', d, sync);
    expect(takeUnsynced('u2')).toBeNull();
    const back = takeUnsynced('u1');
    expect(back?.data.player.totalXp).toBe(77);
    expect(back?.sync).toEqual(sync);
    expect(takeUnsynced('u1')).toBeNull();
  });

  it('ignores a corrupted stash', () => {
    localStorage.setItem('quest-board-unsynced:u1', '{"data":{"nope":1},"sync":{}}');
    expect(takeUnsynced('u1')).toBeNull();
  });
});
