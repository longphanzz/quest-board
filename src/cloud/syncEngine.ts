import type { AppData } from '../types';
import type { SyncMeta } from '../store/useAppStore';
import { SyncError, type LoadResult, type SaveResult } from './api';
import { toCloudBoard, type CloudBoard } from './mapping';

export type SyncStatus = 'synced' | 'saving' | 'offline' | 'error';
export const DEBOUNCE_MS = 2000;
export const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];

export interface SyncDeps {
  load: () => Promise<LoadResult | null>;
  save: (board: CloudBoard, baseRevision: number, clientUpdatedAt: string) => Promise<SaveResult>;
  getLocal: () => { data: AppData; sync: SyncMeta };
  adopt: (board: unknown, revision: number) => boolean;
  markSaved: (revision: number, sentUpdatedAt: string) => void;
  setStatus: (status: SyncStatus) => void;
  toast: (message: string) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface SyncEngine {
  start(): Promise<void>;
  sync(): Promise<void>;
  notifyChange(): void;
  retryNow(): Promise<void>;
  stop(): void;
}

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  let timer: unknown = null;
  let attempt = 0;
  let busy = false;
  let again = false;
  let stopped = false;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer !== null) deps.clearTimer(timer);
    timer = deps.setTimer(() => {
      timer = null;
      void sync();
    }, ms);
  };

  const fail = (error: unknown) => {
    deps.setStatus(error instanceof SyncError && error.kind === 'network' ? 'offline' : 'error');
    schedule(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    attempt += 1;
  };

  const settle = () => {
    if (deps.getLocal().sync.dirty) schedule(DEBOUNCE_MS);
    else deps.setStatus('synced');
  };

  async function push(): Promise<void> {
    const { data, sync: meta } = deps.getLocal();
    const sentAt = meta.localUpdatedAt ?? new Date(0).toISOString();
    deps.setStatus('saving');
    const result = await deps.save(toCloudBoard(data), meta.baseRevision, sentAt);
    if (stopped) return; // signed out or switched user while the request was in flight
    attempt = 0;
    if (result.status === 'saved') {
      deps.markSaved(result.revision, sentAt);
    } else if (deps.getLocal().sync.localUpdatedAt !== sentAt) {
      // Edited during the request: the newer edit pushes again and wins last-write-wins.
      schedule(DEBOUNCE_MS);
      return;
    } else {
      if (!deps.adopt(result.board, result.revision)) {
        deps.setStatus('error');
        return;
      }
      deps.toast('Board updated from another device');
    }
    settle();
  }

  async function pull(): Promise<void> {
    const remote = await deps.load();
    if (stopped) return;
    attempt = 0;
    const local = deps.getLocal().sync;
    if (local.dirty) return push(); // edited while the pull was in flight
    if (remote && remote.revision > local.baseRevision && !deps.adopt(remote.board, remote.revision)) {
      deps.setStatus('error');
      return;
    }
    deps.setStatus('synced');
  }

  async function sync(): Promise<void> {
    if (stopped) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      if (deps.getLocal().sync.dirty) await push();
      else await pull();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      if (again) {
        again = false;
        schedule(DEBOUNCE_MS);
      }
    }
  }

  return {
    start: () => sync(),
    sync,
    notifyChange: () => {
      if (!stopped && deps.getLocal().sync.dirty) schedule(DEBOUNCE_MS);
    },
    retryNow: () => {
      attempt = 0;
      return sync();
    },
    stop: () => {
      stopped = true;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
  };
}
