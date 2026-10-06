import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRUPT_KEY, INITIAL_SYNC, STORAGE_KEY, useAppStore } from './useAppStore';
import { DEVICE_KEY } from './deviceSettings';
import { useEffectsStore } from './useEffectsStore';
import { createDefaultData } from './defaults';

const app = () => useAppStore.getState();
const fx = () => useEffectsStore.getState();

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC }, lastCleared: null });
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

describe('cloud cache', () => {
  it('marks the board dirty on board changes but not on settings changes', () => {
    app().updateSettings({ theme: 'light' });
    expect(app().sync.dirty).toBe(false);
    expect(localStorage.getItem(DEVICE_KEY)).toContain('light');
    app().addColumn('Later');
    expect(app().sync.dirty).toBe(true);
    expect(app().sync.localUpdatedAt).not.toBeNull();
  });

  it('does not mark dirty when an action changes nothing', () => {
    app().addQuest(app().data.columns[0].id, { title: '   ' });
    expect(app().sync.dirty).toBe(false);
  });

  it('markSaved keeps the board dirty when it changed during the save', () => {
    app().addColumn('A');
    const sent = app().sync.localUpdatedAt!;
    app().markSaved(5, sent);
    expect(app().sync).toEqual({ dirty: false, baseRevision: 5, localUpdatedAt: sent });
    app().addColumn('B');
    app().markSaved(6, sent);
    expect(app().sync.dirty).toBe(true);
    expect(app().sync.baseRevision).toBe(6);
  });

  it('adoptServerBoard replaces data without effects and keeps device settings', () => {
    app().updateSettings({ theme: 'light' });
    const server = createDefaultData();
    server.player.totalXp = 999;
    app().adoptServerBoard({ ...server, settings: app().data.settings }, 9);
    expect(app().data.player.totalXp).toBe(999);
    expect(app().data.settings.theme).toBe('light');
    expect(app().sync).toEqual({ dirty: false, baseRevision: 9, localUpdatedAt: null });
    expect(fx().items).toHaveLength(0);
  });

  it('clearLocalBoard wipes the cache but keeps device settings', () => {
    app().updateSettings({ theme: 'light' });
    app().beginSession('user-1', createDefaultData(), { dirty: true, baseRevision: 0, localUpdatedAt: 'x' });
    app().clearLocalBoard();
    expect(app().ownerId).toBeNull();
    expect(app().sync).toEqual(INITIAL_SYNC);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(app().data.settings.theme).toBe('light');
  });

  it('restores ownerId and sync from the cache on rehydrate', async () => {
    app().beginSession('user-1', createDefaultData(), { dirty: true, baseRevision: 2, localUpdatedAt: 'x' });
    const saved = localStorage.getItem(STORAGE_KEY)!;
    useAppStore.setState({ ownerId: null, sync: { ...INITIAL_SYNC } });
    localStorage.setItem(STORAGE_KEY, saved);
    await useAppStore.persist.rehydrate();
    expect(app().ownerId).toBe('user-1');
    expect(app().sync).toEqual({ dirty: true, baseRevision: 2, localUpdatedAt: 'x' });
  });

  it('import keeps device settings and marks the board dirty', () => {
    app().updateSettings({ theme: 'light' });
    const backup = createDefaultData();
    backup.settings.theme = 'dark';
    app().replaceData(backup);
    expect(app().data.settings.theme).toBe('light');
    expect(app().sync.dirty).toBe(true);
  });
});

describe('cloud cache timestamps', () => {
  it('gives two edits in the same millisecond different change stamps', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T10:00:00.000Z'));
    try {
      app().addColumn('A');
      const sent = app().sync.localUpdatedAt!;
      app().addColumn('B');
      app().markSaved(1, sent);
      expect(app().sync.dirty).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('clear done quests with undo', () => {
  const finishWelcome = () => {
    const { columns } = app().data;
    app().moveQuest(columns[0].questIds[0], columns[2].id, 0);
  };

  it('clears Done, remembers the quests for undo, and keeps XP', () => {
    finishWelcome();
    const xp = app().data.player.totalXp;
    expect(app().clearDoneQuests()).toBe(1);
    expect(app().data.columns[2].questIds).toEqual([]);
    expect(app().data.player.totalXp).toBe(xp);
    expect(app().lastCleared).toHaveLength(1);
    expect(app().sync.dirty).toBe(true);
  });

  it('undo puts the quests back and forgets them', () => {
    finishWelcome();
    const id = app().data.columns[2].questIds[0];
    app().clearDoneQuests();
    app().undoClear();
    expect(app().data.columns[2].questIds).toEqual([id]);
    expect(app().lastCleared).toBeNull();
  });

  it('never saves the undo buffer to storage', () => {
    finishWelcome();
    app().clearDoneQuests();
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('lastCleared');
  });

  it('forgets the undo buffer on sign-out and when another session begins', () => {
    finishWelcome();
    app().clearDoneQuests();
    app().clearLocalBoard();
    expect(app().lastCleared).toBeNull();
    finishWelcome();
    app().clearDoneQuests();
    app().beginSession('u2', createDefaultData(), { ...INITIAL_SYNC });
    expect(app().lastCleared).toBeNull();
  });

  it('returns 0 and keeps no undo buffer when Done is empty', () => {
    expect(app().clearDoneQuests()).toBe(0);
    expect(app().lastCleared).toBeNull();
  });
});
