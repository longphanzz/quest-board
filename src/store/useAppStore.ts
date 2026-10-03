import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AppData, AvatarFrames, Result, Settings } from '../types';
import * as board from './board';
import type { QuestInput, QuestPatch } from './board';
import { finalize, moveQuest as moveQuestLogic } from './progress';
import { createDefaultData } from './defaults';
import { validateData } from './persistence';
import { useEffectsStore } from './useEffectsStore';
import { loadDeviceSettings, saveDeviceSettings } from './deviceSettings';

/** This device's copy of the signed-in user's board (the cloud cache). */
export const STORAGE_KEY = 'quest-board-cloud-v1';

export interface SyncMeta { dirty: boolean; baseRevision: number; localUpdatedAt: string | null }
export const INITIAL_SYNC: SyncMeta = { dirty: false, baseRevision: 0, localUpdatedAt: null };

const isSyncMeta = (v: unknown): v is SyncMeta => {
  const s = v as SyncMeta | null;
  return typeof s === 'object' && s !== null && typeof s.dirty === 'boolean' &&
    typeof s.baseRevision === 'number' && s.baseRevision >= 0 &&
    (s.localUpdatedAt === null || typeof s.localUpdatedAt === 'string');
};

const freshData = (): AppData => ({ ...createDefaultData(), settings: loadDeviceSettings() });
export const CORRUPT_KEY = 'quest-board-corrupt-copy';

let saveWarningShown = false;

/** Keeps unreadable saved data under CORRUPT_KEY so the next save cannot destroy it. */
function keepCorruptCopy(raw: string): void {
  try {
    localStorage.setItem(CORRUPT_KEY, raw);
  } catch {
    /* ignore */
  }
  queueMicrotask(() =>
    useEffectsStore.getState().toast('Saved data was damaged — started a fresh board. A copy was kept.', 'error'),
  );
}

const safeStorage: StateStorage = {
  getItem: (key) => {
    let value: string | null;
    try {
      value = localStorage.getItem(key);
    } catch {
      return null;
    }
    if (value === null) return null;
    try {
      const parsed = JSON.parse(value) as { state?: { data?: unknown } } | null;
      if (parsed?.state?.data === undefined) throw new Error('missing state');
    } catch {
      // zustand would swallow this parse error and later overwrite the value.
      keepCorruptCopy(value);
      return null;
    }
    return value;
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      saveWarningShown = false;
    } catch {
      if (saveWarningShown) return;
      saveWarningShown = true;
      useEffectsStore.getState().toast('Could not save — browser storage is full. Export a backup now!', 'error');
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export interface AppState {
  data: AppData;
  addQuest: (columnId: string, input: QuestInput) => string | null;
  updateQuest: (questId: string, patch: QuestPatch) => boolean;
  deleteQuest: (questId: string) => void;
  moveQuest: (questId: string, toColumnId: string, toIndex: number) => void;
  addColumn: (name: string) => string | null;
  renameColumn: (columnId: string, name: string) => boolean;
  deleteColumn: (columnId: string) => boolean;
  setDoneColumn: (columnId: string) => void;
  moveColumn: (from: number, to: number) => void;
  addLabel: (name: string, color: string) => string | null;
  deleteLabel: (labelId: string) => void;
  saveAvatar: (frames: AvatarFrames) => void;
  resetAvatar: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markExported: () => void;
  replaceData: (data: AppData) => void;
  ownerId: string | null;
  sync: SyncMeta;
  beginSession: (ownerId: string, data: AppData, sync: SyncMeta) => void;
  adoptServerBoard: (data: AppData, revision: number) => void;
  markSaved: (revision: number, sentUpdatedAt: string) => void;
  clearLocalBoard: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const run = (fn: (data: AppData, now: Date) => Result): Result => {
        const now = new Date();
        const before = get().data;
        const result = fn(before, now);
        const effects = useEffectsStore.getState();
        if (result.error) {
          effects.toast(result.error, 'error');
          return result;
        }
        if (result.data !== before) {
          // Strictly increasing, so an edit in the same millisecond as a save is never mistaken for the saved one.
          const prev = get().sync.localUpdatedAt;
          const stamp = prev && Date.parse(prev) >= now.getTime() ? new Date(Date.parse(prev) + 1) : now;
          set({ data: result.data, sync: { ...get().sync, dirty: true, localUpdatedAt: stamp.toISOString() } });
        }
        effects.push(result.events);
        return result;
      };
      return {
        data: freshData(),
        ownerId: null,
        sync: { ...INITIAL_SYNC },
        addQuest: (columnId, input) => run((d, now) => board.addQuest(d, columnId, input, now)).createdId ?? null,
        updateQuest: (questId, patch) => !run((d, now) => board.updateQuest(d, questId, patch, now)).error,
        deleteQuest: (questId) => void run((d, now) => board.deleteQuest(d, questId, now)),
        moveQuest: (questId, toColumnId, toIndex) =>
          void run((d, now) => moveQuestLogic(d, questId, toColumnId, toIndex, now)),
        addColumn: (name) => run((d) => board.addColumn(d, name)).createdId ?? null,
        renameColumn: (columnId, name) => !run((d) => board.renameColumn(d, columnId, name)).error,
        deleteColumn: (columnId) => !run((d, now) => board.deleteColumn(d, columnId, now)).error,
        setDoneColumn: (columnId) => void run((d) => board.setDoneColumn(d, columnId)),
        moveColumn: (from, to) => void run((d) => board.moveColumn(d, from, to)),
        addLabel: (name, color) => run((d) => board.addLabel(d, name, color)).createdId ?? null,
        deleteLabel: (labelId) => void run((d) => board.deleteLabel(d, labelId)),
        saveAvatar: (frames) => void run((d, now) => board.saveAvatar(d, frames, now)),
        resetAvatar: () => void run((d) => board.resetAvatar(d)),
        updateSettings: (patch) => {
          const settings = { ...get().data.settings, ...patch };
          saveDeviceSettings(settings);
          set((s) => ({ data: { ...s.data, settings } }));
        },
        markExported: () => get().updateSettings({ lastExportAt: new Date().toISOString() }),
        replaceData: (data) => void run((current, now) => finalize({ ...data, settings: current.settings }, [], now)),
        beginSession: (ownerId, data, sync) => set({ ownerId, data: { ...data, settings: get().data.settings }, sync }),
        adoptServerBoard: (data, revision) =>
          set({ data: { ...data, settings: get().data.settings }, sync: { dirty: false, baseRevision: revision, localUpdatedAt: null } }),
        markSaved: (revision, sentUpdatedAt) =>
          set((s) => ({
            sync: { dirty: s.sync.localUpdatedAt !== sentUpdatedAt, baseRevision: revision, localUpdatedAt: s.sync.localUpdatedAt },
          })),
        clearLocalBoard: () => {
          set({ ownerId: null, sync: { ...INITIAL_SYNC }, data: { ...createDefaultData(), settings: get().data.settings } });
          useAppStore.persist.clearStorage();
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ data: state.data, ownerId: state.ownerId, sync: state.sync }),
      // Accept any stored version; validateData in merge decides whether the data is usable.
      migrate: (persisted) => persisted as AppState,
      merge: (persisted, current) => {
        const p = persisted as { data?: unknown; ownerId?: unknown; sync?: unknown } | undefined;
        if (p?.data === undefined) return current;
        const result = validateData(p.data);
        if (!result.ok) {
          keepCorruptCopy(JSON.stringify(p.data));
          return current;
        }
        return {
          ...current,
          data: { ...result.data, settings: loadDeviceSettings() },
          ownerId: typeof p.ownerId === 'string' ? p.ownerId : null,
          sync: isSyncMeta(p.sync) ? p.sync : { ...INITIAL_SYNC },
        };
      },
    },
  ),
);

// Another window (e.g. the installed PWA and a browser tab) saved: reload so we never overwrite its changes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void useAppStore.persist.rehydrate();
  });
}
