import { getSupabase } from './client';
import type { CloudBoard } from './mapping';

export class SyncError extends Error {
  kind: 'network' | 'server';
  constructor(kind: 'network' | 'server', message: string) {
    super(message);
    this.kind = kind;
    this.name = 'SyncError';
  }
}

export interface LoadResult { revision: number; clientUpdatedAt: string; board: unknown }
export type SaveResult =
  | { status: 'saved'; revision: number }
  | { status: 'stale'; revision: number; clientUpdatedAt: string; board: unknown };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const looksLikeNetwork = (message: string) => /fetch|network|timeout|abort/i.test(message);

function toSyncError(message: string): SyncError {
  return new SyncError(offline() || looksLikeNetwork(message) ? 'network' : 'server', message);
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let response: { data: unknown; error: { message: string } | null };
  try {
    response = args ? await getSupabase().rpc(fn, args) : await getSupabase().rpc(fn);
  } catch (e) {
    throw toSyncError(e instanceof Error ? e.message : String(e));
  }
  if (response.error) throw toSyncError(response.error.message);
  return response.data as T;
}

export const loadBoard = () => call<LoadResult | null>('load_board');

export const saveBoard = (board: CloudBoard, baseRevision: number, clientUpdatedAt: string) =>
  call<SaveResult>('save_board', {
    p_board: board,
    p_base_revision: baseRevision,
    p_client_updated_at: clientUpdatedAt,
  });
