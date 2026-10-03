import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./cloud/auth', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({ status: 'signedIn', user: { id: 'u1', email: 'a@b.co' }, recovery: false })),
    initAuth: () => () => {}, signOut: vi.fn(),
    signIn: vi.fn(), signUp: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(), MIN_PASSWORD: 8,
  };
});
vi.mock('./cloud/useCloudSync', () => ({ useCloudSync: vi.fn() }));

const { default: App } = await import('./App');
const { useAppStore } = await import('./store/useAppStore');

describe('App', () => {
  it('renders the board for the signed-in owner', () => {
    useAppStore.setState({ ownerId: 'u1' });
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Quest Board' })).toBeInTheDocument();
  });
});
