import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRUPT_KEY, STORAGE_KEY, useAppStore } from './useAppStore';
import { useEffectsStore } from './useEffectsStore';
import { createDefaultData } from './defaults';

const app = () => useAppStore.getState();
const fx = () => useEffectsStore.getState();

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData() });
  useEffectsStore.setState({ items: [], mood: null });
});
afterEach(() => vi.restoreAllMocks());

describe('useAppStore', () => {
  it('adds a quest and persists it to localStorage', () => {
    const todo = app().data.columns[0].id;
    const id = app().addQuest(todo, { title: 'Ôn thi cuối kỳ' });
    expect(id).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Ôn thi cuối kỳ');
  });

  it('turns logic errors into error toasts', () => {
    expect(app().addQuest(app().data.columns[0].id, { title: ' ' })).toBeNull();
    expect(fx().items.at(-1)?.event).toEqual({ type: 'toast', message: 'Quest title cannot be empty.', tone: 'error' });
  });

  it('pushes game events and a happy mood when a quest is completed', () => {
    const { columns } = app().data;
    const questId = columns[0].questIds[0];
    app().moveQuest(questId, columns[2].id, 0);
    expect(fx().items.map((i) => i.event.type)).toEqual(['questCompleted', 'achievement']);
    expect(fx().mood?.mood).toBe('happy');
  });

  it('warns once when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    app().addColumn('A');
    app().addColumn('B');
    const toasts = fx().items.filter((i) => i.event.type === 'toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].event).toMatchObject({ tone: 'error' });
  });

  it('starts fresh and keeps a copy when saved data is corrupted', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { data: { schemaVersion: 1, columns: 'bad' } }, version: 1 }));
    await useAppStore.persist.rehydrate();
    expect(app().data.columns).toHaveLength(3);
    expect(localStorage.getItem(CORRUPT_KEY)).toContain('bad');
  });
});

describe('useEffectsStore', () => {
  it('prefers the level-up mood and auto-dismisses items', () => {
    vi.useFakeTimers();
    try {
      fx().push([{ type: 'questCompleted', questId: 'q', xp: 10, difficulty: 'easy' }, { type: 'levelUp', level: 2 }]);
      expect(fx().mood?.mood).toBe('levelUp');
      expect(fx().items).toHaveLength(2);
      vi.advanceTimersByTime(5000);
      expect(fx().items).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('replaceData', () => {
  it('re-checks achievements right after an import', () => {
    const data = createDefaultData();
    data.player.stats.completed = 1;
    app().replaceData(data);
    expect(app().data.player.unlockedAchievements['first-blood']).toBeDefined();
  });
});

describe('review fixes: storage', () => {
  it('keeps a copy of unparseable saved data instead of silently overwriting it', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    await useAppStore.persist.rehydrate();
    expect(localStorage.getItem(CORRUPT_KEY)).toBe('{not json');
    expect(fx().items.some((i) => i.event.type === 'toast' && i.event.tone === 'error')).toBe(true);
  });

  it('loads valid data saved under another version number', async () => {
    const data = createDefaultData();
    data.player.totalXp = 42;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { data }, version: 7 }));
    await useAppStore.persist.rehydrate();
    expect(app().data.player.totalXp).toBe(42);
  });

  it('picks up changes saved by another window', () => {
    const data = createDefaultData();
    data.player.totalXp = 99;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { data }, version: 1 }));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(app().data.player.totalXp).toBe(99);
  });
});
