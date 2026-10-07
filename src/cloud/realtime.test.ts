import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: { new: Record<string, unknown> }) => void;
let handler: Handler | null = null;
const on = vi.fn((_type: string, _filter: unknown, cb: Handler) => {
  handler = cb;
  return channel;
});
const subscribe = vi.fn(() => channel);
const channel = { on, subscribe };
const channelFactory = vi.fn(() => channel);
const removeChannel = vi.fn();
vi.mock('./client', () => ({ getSupabase: () => ({ channel: channelFactory, removeChannel }) }));

const { subscribeToRevisions } = await import('./realtime');

afterEach(() => {
  vi.clearAllMocks();
  handler = null;
});

describe('subscribeToRevisions', () => {
  it('listens only to the signed-in user’s profile row', () => {
    subscribeToRevisions('user-1', () => {});
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: 'user_id=eq.user-1' },
      expect.any(Function),
    );
    expect(subscribe).toHaveBeenCalled();
  });

  it('reports the new revision number', () => {
    const onRevision = vi.fn();
    subscribeToRevisions('user-1', onRevision);
    handler!({ new: { user_id: 'user-1', revision: 12 } });
    expect(onRevision).toHaveBeenCalledWith(12);
  });

  it('ignores events without a revision (e.g. deletes)', () => {
    const onRevision = vi.fn();
    subscribeToRevisions('user-1', onRevision);
    handler!({ new: {} });
    expect(onRevision).not.toHaveBeenCalled();
  });

  it('removes the channel when unsubscribed', () => {
    const unsubscribe = subscribeToRevisions('user-1', () => {});
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
