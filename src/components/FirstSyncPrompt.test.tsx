import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '../store/defaults';
import { toCloudBoard } from '../cloud/mapping';

const loadBoard = vi.fn();
vi.mock('../cloud/api', async (orig) => ({ ...(await orig<typeof import('../cloud/api')>()), loadBoard }));

const { FirstSyncPrompt } = await import('./FirstSyncPrompt');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');
const { LEGACY_KEY } = await import('../store/deviceSettings');
const { SyncError } = await import('../cloud/api');

const legacyBoard = () => {
  const d = createDefaultData();
  d.player.totalXp = 321;
  localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { data: d }, version: 1 }));
};
const app = () => useAppStore.getState();

beforeEach(() => useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC } }));
afterEach(() => loadBoard.mockReset());

describe('FirstSyncPrompt', () => {
  it("restores this account's unsynced changes without asking or going online", async () => {
    const { stashUnsynced } = await import('../cloud/firstSync');
    const d = createDefaultData();
    d.player.totalXp = 55;
    stashUnsynced('u1', d, { dirty: true, baseRevision: 3, localUpdatedAt: '2026-10-06T01:00:00.000Z' });
    render(<FirstSyncPrompt userId="u1" />);
    await waitFor(() => expect(app().ownerId).toBe('u1'));
    expect(app().data.player.totalXp).toBe(55);
    expect(app().sync).toEqual({ dirty: true, baseRevision: 3, localUpdatedAt: '2026-10-06T01:00:00.000Z' });
    expect(loadBoard).not.toHaveBeenCalled();
  });

  it("sets aside another account's unsynced changes before loading this one", async () => {
    const { takeUnsynced } = await import('../cloud/firstSync');
    const d = createDefaultData();
    d.player.totalXp = 66;
    useAppStore.setState({ data: d, ownerId: 'other', sync: { dirty: true, baseRevision: 1, localUpdatedAt: 'x' } });
    loadBoard.mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    await waitFor(() => expect(app().ownerId).toBe('u1'));
    expect(app().data.player.totalXp).toBe(0);
    expect(takeUnsynced('other')?.data.player.totalXp).toBe(66);
  });

  it('uploads the local board to an empty account', async () => {
    legacyBoard();
    loadBoard.mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Upload' }));
    expect(app().ownerId).toBe('u1');
    expect(app().data.player.totalXp).toBe(321);
    expect(app().sync).toMatchObject({ dirty: true, baseRevision: 0 });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('creates the default board for an empty account without a local board', async () => {
    loadBoard.mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    await waitFor(() => expect(app().ownerId).toBe('u1'));
    expect(app().data.columns.map((c) => c.name)).toEqual(['To Do', 'Doing', 'Done']);
    expect(app().sync.dirty).toBe(true);
  });

  it('can keep the account board instead of the local one', async () => {
    legacyBoard();
    const server = createDefaultData();
    server.player.totalXp = 50;
    loadBoard.mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: toCloudBoard(server) });
    render(<FirstSyncPrompt userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use account board' }));
    expect(app().data.player.totalXp).toBe(50);
    expect(app().sync).toEqual({ dirty: false, baseRevision: 4, localUpdatedAt: null });
  });

  it('can replace the account board with this device', async () => {
    legacyBoard();
    loadBoard.mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: toCloudBoard(createDefaultData()) });
    render(<FirstSyncPrompt userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: "Replace with this device's board" }));
    expect(app().data.player.totalXp).toBe(321);
    expect(app().sync).toMatchObject({ dirty: true, baseRevision: 4 });
  });

  it('asks to go online when the account cannot be reached', async () => {
    loadBoard.mockRejectedValueOnce(new SyncError('network', 'Failed to fetch')).mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    expect(await screen.findByText('Connect to the internet to set up your board.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(app().ownerId).toBe('u1'));
  });
});
