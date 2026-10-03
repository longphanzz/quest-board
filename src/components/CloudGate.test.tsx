import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createDefaultData } from '../store/defaults';

vi.mock('../cloud/auth', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({ status: 'loading', user: null, recovery: false })),
    initAuth: () => () => {},
    signIn: vi.fn(), signUp: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn(), MIN_PASSWORD: 8,
  };
});
vi.mock('../cloud/useCloudSync', () => ({ useCloudSync: vi.fn() }));
vi.mock('../cloud/api', async (orig) => ({ ...(await orig<typeof import('../cloud/api')>()), loadBoard: vi.fn(() => new Promise(() => {})) }));

const { CloudGate } = await import('./CloudGate');
const { useAuthStore } = await import('../cloud/auth');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');

const signedIn = (id: string) => useAuthStore.setState({ status: 'signedIn', user: { id, email: 'a@b.co' }, recovery: false });
const renderGate = () => render(<CloudGate><p>BOARD</p></CloudGate>);

beforeEach(() => useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC } }));

describe('CloudGate', () => {
  it('shows a loading screen while auth starts', () => {
    useAuthStore.setState({ status: 'loading', user: null, recovery: false });
    renderGate();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the sign-in screen when signed out', () => {
    useAuthStore.setState({ status: 'signedOut', user: null, recovery: false });
    renderGate();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
  });

  it('shows the reset screen during password recovery', () => {
    useAuthStore.setState({ status: 'signedIn', user: { id: 'u1', email: 'a@b.co' }, recovery: true });
    renderGate();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeInTheDocument();
  });

  it('runs first sync when the cache belongs to someone else', () => {
    useAppStore.setState({ ownerId: 'other-user' });
    signedIn('u1');
    renderGate();
    expect(screen.getByText('Loading your board…')).toBeInTheDocument();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
  });

  it('shows the board when the cache belongs to the signed-in user', () => {
    useAppStore.setState({ ownerId: 'u1' });
    signedIn('u1');
    renderGate();
    expect(screen.getByText('BOARD')).toBeInTheDocument();
  });
});
