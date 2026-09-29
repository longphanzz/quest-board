import { describe, expect, it } from 'vitest';
import { createDefaultData, newId } from './defaults';
import { T0 } from '../test/fixtures';

describe('createDefaultData', () => {
  it('creates To Do / Doing / Done with one welcome quest', () => {
    const data = createDefaultData(T0);
    expect(data.columns.map((c) => c.name)).toEqual(['To Do', 'Doing', 'Done']);
    expect(data.columns.filter((c) => c.isDone).map((c) => c.name)).toEqual(['Done']);
    expect(data.columns[0].questIds).toHaveLength(1);
    expect(Object.keys(data.quests)).toEqual(data.columns[0].questIds);
    expect(data.player.totalXp).toBe(0);
    expect(data.settings.installedAt).toBe(T0.toISOString());
    expect(data.settings.musicOn).toBe(false);
  });
});

describe('newId', () => {
  it('returns unique ids', () => {
    expect(newId()).not.toBe(newId());
  });
  it('falls back when crypto.randomUUID is unavailable (plain-http LAN access)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = newId();
      const b = newId();
      expect(a).not.toBe(b);
      expect(a.length).toBeGreaterThan(8);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
