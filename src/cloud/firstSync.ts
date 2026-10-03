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

export function clearLegacyBoard(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
