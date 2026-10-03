import { describe, expect, it } from 'vitest';
import { clearLegacyBoard, decideFirstSync, readLegacyBoard } from './firstSync';
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
