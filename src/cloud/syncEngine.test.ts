import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKOFF_MS, DEBOUNCE_MS, createSyncEngine, type SyncDeps, type SyncStatus } from './syncEngine';
import { SyncError } from './api';
import type { SyncMeta } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

function setup(sync: Partial<SyncMeta> = {}) {
  const state = { data: createDefaultData(), sync: { dirty: false, baseRevision: 0, localUpdatedAt: null, ...sync } as SyncMeta };
  const statuses: SyncStatus[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const deps: SyncDeps = {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ status: 'saved', revision: 1 }),
    getLocal: () => state,
    adopt: vi.fn((_board: unknown, revision: number) => {
      state.sync = { dirty: false, baseRevision: revision, localUpdatedAt: null };
      return true;
    }),
    markSaved: vi.fn((revision: number, sent: string) => {
      state.sync = { ...state.sync, dirty: state.sync.localUpdatedAt !== sent, baseRevision: revision };
    }),
    setStatus: (s) => statuses.push(s),
    toast: vi.fn(),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => timers.splice(0),
  };
  const edit = (at: string) => { state.sync = { ...state.sync, dirty: true, localUpdatedAt: at }; };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fire = async () => { const t = timers.splice(0); for (const x of t) x.fn(); await flush(); };
  return { state, statuses, timers, deps, edit, fire, engine: createSyncEngine(deps) };
}

describe('sync engine', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('debounces changes and pushes the whole board once', async () => {
    s.edit('t1'); s.engine.notifyChange(); s.engine.notifyChange();
    expect(s.timers).toHaveLength(1);
    expect(s.timers[0].ms).toBe(DEBOUNCE_MS);
    await s.fire();
    expect(s.deps.save).toHaveBeenCalledTimes(1);
    expect(s.deps.save).toHaveBeenCalledWith(expect.objectContaining({ columns: expect.any(Array) }), 0, 't1');
    expect(s.state.sync).toMatchObject({ dirty: false, baseRevision: 1 });
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('stays dirty and pushes again when edited during an in-flight save', async () => {
    let release!: (v: unknown) => void;
    (s.deps.save as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { release = r; }));
    s.edit('t1');
    const pushing = s.engine.sync();
    s.edit('t2');
    release({ status: 'saved', revision: 1 });
    await pushing;
    expect(s.state.sync.dirty).toBe(true);
    expect(s.timers.at(-1)?.ms).toBe(DEBOUNCE_MS);
    await s.fire();
    expect(s.deps.save).toHaveBeenLastCalledWith(expect.anything(), 1, 't2');
    expect(s.state.sync.dirty).toBe(false);
  });

  it('adopts the server board on a stale save and tells the user', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 'stale', revision: 7, clientUpdatedAt: 'x', board: { b: 1 } });
    s.edit('t1');
    await s.engine.sync();
    expect(s.deps.adopt).toHaveBeenCalledWith({ b: 1 }, 7);
    expect(s.deps.toast).toHaveBeenCalledWith('Board updated from another device');
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('shows an error and keeps local data when the stale board is malformed', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 'stale', revision: 7, clientUpdatedAt: 'x', board: null });
    (s.deps.adopt as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    s.edit('t1');
    await s.engine.sync();
    expect(s.statuses.at(-1)).toBe('error');
    expect(s.state.sync.dirty).toBe(true);
  });

  it('goes offline on network errors and backs off 5s, 10s, ... capped at 60s', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockRejectedValue(new SyncError('network', 'Failed to fetch'));
    s.edit('t1');
    await s.engine.sync();
    expect(s.statuses.at(-1)).toBe('offline');
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) { delays.push(s.timers[0].ms); await s.fire(); }
    expect(delays).toEqual([...BACKOFF_MS, 60000, 60000]);
  });

  it('reports server errors as error and retries immediately on retryNow', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new SyncError('server', 'boom'));
    s.edit('t1');
    await s.engine.sync();
    expect(s.statuses.at(-1)).toBe('error');
    await s.engine.retryNow();
    expect(s.state.sync.dirty).toBe(false);
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('pull adopts a newer server board when nothing is dirty', async () => {
    (s.deps.load as ReturnType<typeof vi.fn>).mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: { b: 2 } });
    await s.engine.sync();
    expect(s.deps.adopt).toHaveBeenCalledWith({ b: 2 }, 4);
  });

  it('pull ignores a server board that is not newer', async () => {
    s = setup({ baseRevision: 4 });
    (s.deps.load as ReturnType<typeof vi.fn>).mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: {} });
    await s.engine.sync();
    expect(s.deps.adopt).not.toHaveBeenCalled();
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('never overwrites an edit made while a pull was in flight', async () => {
    let release!: (v: unknown) => void;
    (s.deps.load as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { release = r; }));
    const pulling = s.engine.sync();
    s.edit('t9');
    release({ revision: 4, clientUpdatedAt: 'x', board: {} });
    await pulling;
    expect(s.deps.adopt).not.toHaveBeenCalled();
    expect(s.deps.save).toHaveBeenCalledWith(expect.anything(), 0, 't9');
  });

  it('pushes instead of pulling when dirty', async () => {
    s.edit('t1');
    await s.engine.start();
    expect(s.deps.load).not.toHaveBeenCalled();
    expect(s.deps.save).toHaveBeenCalled();
  });

  it('stop cancels timers and ignores later changes', () => {
    s.edit('t1'); s.engine.notifyChange();
    s.engine.stop();
    expect(s.timers).toHaveLength(0);
    s.engine.notifyChange();
    expect(s.timers).toHaveLength(0);
  });

  it('review I-1: does not adopt a stale board over an edit made during the save', async () => {
    let release!: (v: unknown) => void;
    (s.deps.save as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { release = r; }));
    s.edit('t1');
    const pushing = s.engine.sync();
    s.edit('t2');
    release({ status: 'stale', revision: 7, clientUpdatedAt: 'x', board: {} });
    await pushing;
    expect(s.deps.adopt).not.toHaveBeenCalled();
    expect(s.state.sync).toMatchObject({ dirty: true, localUpdatedAt: 't2' });
    expect(s.timers.at(-1)?.ms).toBe(DEBOUNCE_MS);
  });

  it('review I-2: ignores save and pull responses that arrive after stop', async () => {
    let release!: (v: unknown) => void;
    (s.deps.save as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { release = r; }));
    s.edit('t1');
    const pushing = s.engine.sync();
    s.engine.stop();
    release({ status: 'saved', revision: 3 });
    await pushing;
    expect(s.deps.markSaved).not.toHaveBeenCalled();

    const t = setup();
    let releaseLoad!: (v: unknown) => void;
    (t.deps.load as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { releaseLoad = r; }));
    const pulling = t.engine.sync();
    t.engine.stop();
    releaseLoad({ revision: 9, clientUpdatedAt: 'x', board: {} });
    await pulling;
    expect(t.deps.adopt).not.toHaveBeenCalled();
  });
});
