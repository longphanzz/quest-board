import { useCallback, useEffect, useState } from 'react';
import { loadBoard, SyncError, type LoadResult } from '../cloud/api';
import { clearLegacyBoard, decideFirstSync, readLegacyBoard, type FirstSyncCase } from '../cloud/firstSync';
import { fromCloudBoard } from '../cloud/mapping';
import { createDefaultData } from '../store/defaults';
import { useAppStore } from '../store/useAppStore';
import type { AppData } from '../types';
import './Auth.css';

type View = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ask'; case: FirstSyncCase; account: LoadResult | null; legacy: AppData };

export function FirstSyncPrompt({ userId }: { userId: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const pushLocal = useCallback((data: AppData, account: LoadResult | null) => {
    useAppStore.getState().beginSession(userId, data, {
      dirty: true, baseRevision: account?.revision ?? 0, localUpdatedAt: new Date().toISOString(),
    });
    clearLegacyBoard();
  }, [userId]);

  const useAccount = useCallback((account: LoadResult) => {
    const store = useAppStore.getState();
    const result = fromCloudBoard(account.board, store.data.settings);
    if (!result.ok) {
      setView({ kind: 'error', message: 'Your account board could not be read. Try again later.' });
      return;
    }
    store.beginSession(userId, result.data, { dirty: false, baseRevision: account.revision, localUpdatedAt: null });
    clearLegacyBoard();
  }, [userId]);

  const begin = useCallback(async () => {
    setView({ kind: 'loading' });
    let account: LoadResult | null;
    try {
      account = await loadBoard();
    } catch (e) {
      setView({
        kind: 'error',
        message: e instanceof SyncError && e.kind === 'network'
          ? 'Connect to the internet to set up your board.'
          : 'Could not reach your account. Try again.',
      });
      return;
    }
    const legacy = readLegacyBoard();
    const decision = decideFirstSync(account, legacy);
    if (decision === 'create-default') pushLocal(createDefaultData(), null);
    else if (decision === 'use-account') useAccount(account!);
    else setView({ kind: 'ask', case: decision, account, legacy: legacy! });
  }, [pushLocal, useAccount]);

  useEffect(() => {
    void begin();
  }, [begin]);

  return (
    <main className="auth-screen">
      <div className="auth-card pixel-box">
        {view.kind === 'loading' && <p className="auth-sub">Loading your board…</p>}
        {view.kind === 'error' && (
          <>
            <p className="auth-error" role="alert">{view.message}</p>
            <button className="pixel-btn primary" onClick={() => void begin()}>Retry</button>
          </>
        )}
        {view.kind === 'ask' && view.case === 'ask-upload' && (
          <>
            <h1 className="auth-title">WELCOME!</h1>
            <p>Upload your local board to this account?</p>
            <button className="pixel-btn primary" onClick={() => pushLocal(view.legacy, view.account)}>Upload</button>
            <button className="pixel-btn" onClick={() => pushLocal(createDefaultData(), view.account)}>Start fresh</button>
          </>
        )}
        {view.kind === 'ask' && view.case === 'ask-replace' && (
          <>
            <h1 className="auth-title">TWO BOARDS</h1>
            <p>This account already has a board, and this device has a different one.</p>
            <button className="pixel-btn primary" onClick={() => useAccount(view.account!)}>Use account board</button>
            <button className="pixel-btn" onClick={() => pushLocal(view.legacy, view.account)}>Replace with this device's board</button>
          </>
        )}
      </div>
    </main>
  );
}
