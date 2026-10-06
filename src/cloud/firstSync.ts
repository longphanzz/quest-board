import type { AppData } from '../types';
import { LEGACY_KEY } from '../store/deviceSettings';
import { validateData } from '../store/persistence';
import type { LoadResult } from './api';

export type FirstSyncCase = 'ask-upload' | 'create-default' | 'ask-replace' | 'use-account';

export function decideFirstSync(account: LoadResult | null, legacy: AppData | null): FirstSyncCase {
  if (!account) return legacy ? 'ask-upload' : 'create-default';
  return legacy ? 'ask-replace' : 'use-account';
}

export function readLegacyBoard(): AppData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return null;
    const result = validateData((JSON.parse(raw) as { state?: { data?: unknown } })?.state?.data);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/** Where the pre-cloud board is archived, so no first-sync choice can destroy it. */
export const LEGACY_BACKUP_KEY = 'quest-board-v1-backup';

export function clearLegacyBoard(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw !== null) localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

type Sync = { dirty: boolean; baseRevision: number; localUpdatedAt: string | null };
const stashKey = (ownerId: string) => `quest-board-unsynced:${ownerId}`;

/** Sets aside a board whose last edits never reached the cloud, so another sign-in on this device cannot wipe them. */
export function stashUnsynced(ownerId: string, data: AppData, sync: Sync): void {
  try {
    localStorage.setItem(stashKey(ownerId), JSON.stringify({ data, sync }));
  } catch {
    /* ignore */
  }
}

/** Hands a stashed board back to its owner once, so the next sync uploads it as usual. */
export function takeUnsynced(ownerId: string): { data: AppData; sync: Sync } | null {
  try {
    const raw = localStorage.getItem(stashKey(ownerId));
    if (raw === null) return null;
    localStorage.removeItem(stashKey(ownerId));
    const parsed = JSON.parse(raw) as { data?: unknown; sync?: Partial<Sync> };
    const result = validateData(parsed.data);
    const s = parsed.sync;
    if (!result.ok || typeof s?.baseRevision !== 'number') return null;
    return { data: result.data, sync: { dirty: true, baseRevision: s.baseRevision, localUpdatedAt: s.localUpdatedAt ?? null } };
  } catch {
    return null;
  }
}
