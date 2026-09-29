import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AppData, AvatarFrames, Result, Settings } from '../types';
import * as board from './board';
import type { QuestInput, QuestPatch } from './board';
import { finalize, moveQuest as moveQuestLogic } from './progress';
import { createDefaultData } from './defaults';
import { validateData } from './persistence';
import { useEffectsStore } from './useEffectsStore';

export const STORAGE_KEY = 'quest-board-v1';
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
  snoozeBackup: () => void;
  replaceData: (data: AppData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const run = (fn: (data: AppData, now: Date) => Result): Result => {
        const result = fn(get().data, new Date());
        const effects = useEffectsStore.getState();
        if (result.error) {
          effects.toast(result.error, 'error');
          return result;
        }
        set({ data: result.data });
        effects.push(result.events);
        return result;
      };
      return {
        data: createDefaultData(),
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
        updateSettings: (patch) => set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, ...patch } } })),
        markExported: () => get().updateSettings({ lastExportAt: new Date().toISOString() }),
        snoozeBackup: () => get().updateSettings({ backupSnoozedUntil: new Date(Date.now() + 86_400_000).toISOString() }),
        replaceData: (data) => void run((_, now) => finalize(data, [], now)),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ data: state.data }),
      // Accept any stored version; validateData in merge decides whether the data is usable.
      migrate: (persisted) => persisted as AppState,
      merge: (persisted, current) => {
        const raw = (persisted as { data?: unknown } | undefined)?.data;
        if (raw === undefined) return current;
        const result = validateData(raw);
        if (result.ok) return { ...current, data: result.data };
        keepCorruptCopy(JSON.stringify(raw));
        return current;
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
