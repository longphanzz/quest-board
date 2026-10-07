import { useEffect } from 'react';
import { createSyncEngine } from './syncEngine';
import { loadBoard, saveBoard } from './api';
import { fromCloudBoard } from './mapping';
import { subscribeToRevisions } from './realtime';
import { useSyncStore } from './useSyncStore';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';

/** Runs the sync engine for the signed-in user while the board is on screen. */
export function useCloudSync(userId: string): void {
  useEffect(() => {
    const engine = createSyncEngine({
      load: loadBoard,
      save: saveBoard,
      getLocal: () => useAppStore.getState(),
      adopt: (board, revision) => {
        const store = useAppStore.getState();
        if (store.ownerId !== userId) return true; // the cache now belongs to someone else: drop the response
        const result = fromCloudBoard(board, store.data.settings);
        if (result.ok) store.adoptServerBoard(result.data, revision);
        return result.ok;
      },
      markSaved: (revision, sent) => {
        if (useAppStore.getState().ownerId === userId) useAppStore.getState().markSaved(revision, sent);
      },
      setStatus: (status) => useSyncStore.setState({ status }),
      toast: (message) => useEffectsStore.getState().toast(message),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    });
    useSyncStore.setState({ retry: () => void engine.retryNow() });

    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.sync.localUpdatedAt !== prev.sync.localUpdatedAt) engine.notifyChange();
    });
    const onOnline = () => void engine.retryNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void engine.sync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    // Another device saved: pull right away instead of waiting for the tab to regain focus.
    const unsubscribeRealtime = subscribeToRevisions(userId, (revision) => {
      if (revision > useAppStore.getState().sync.baseRevision) void engine.sync();
    });
    void engine.start();

    return () => {
      engine.stop();
      unsubscribe();
      unsubscribeRealtime();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      useSyncStore.setState({ retry: null, status: 'synced' });
    };
  }, [userId]);
}
