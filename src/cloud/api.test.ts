import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./client', () => ({ getSupabase: () => ({ rpc }) }));

const { loadBoard, saveBoard, SyncError } = await import('./api');

afterEach(() => {
  rpc.mockReset();
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('calls load_board and returns its data', async () => {
    rpc.mockResolvedValue({ data: { revision: 3, clientUpdatedAt: 'x', board: {} }, error: null });
    await expect(loadBoard()).resolves.toEqual({ revision: 3, clientUpdatedAt: 'x', board: {} });
    expect(rpc).toHaveBeenCalledWith('load_board');
  });

  it('passes save_board arguments by name', async () => {
    rpc.mockResolvedValue({ data: { status: 'saved', revision: 4 }, error: null });
    const board = { columns: [] } as never;
    await saveBoard(board, 3, '2026-10-03T00:00:00.000Z');
    expect(rpc).toHaveBeenCalledWith('save_board', {
      p_board: board, p_base_revision: 3, p_client_updated_at: '2026-10-03T00:00:00.000Z',
    });
  });

  it('classifies fetch failures as network errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await expect(loadBoard()).rejects.toMatchObject({ kind: 'network' });
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(loadBoard()).rejects.toBeInstanceOf(SyncError);
  });

  it('classifies database errors as server errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'new row violates check constraint', code: '23514' } });
    await expect(saveBoard({} as never, 0, 'x')).rejects.toMatchObject({ kind: 'server' });
  });
});
