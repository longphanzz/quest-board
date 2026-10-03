import { create } from 'zustand';
import type { SyncStatus } from './syncEngine';

export const useSyncStore = create<{ status: SyncStatus; retry: (() => void) | null }>(() => ({ status: 'synced', retry: null }));
