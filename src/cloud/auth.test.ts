import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
};
vi.mock('./client', () => ({ getSupabase: () => ({ auth }) }));

const mod = await import('./auth');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');

afterEach(() => Object.values(auth).forEach((f) => f.mockReset()));

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'Wrong email or password'],
    [{ code: 'email_not_confirmed' }, 'Email not confirmed yet'],
    [{ code: 'user_already_exists' }, 'That email already has an account'],
    [{ code: 'weak_password' }, 'Password is too weak'],
    [{ name: 'AuthRetryableFetchError' }, 'No connection'],
    [new TypeError('Failed to fetch'), 'No connection'],
    [{ code: 'something_else' }, 'Something went wrong — try again'],
  ])('maps %o', (error, message) => {
    expect(mod.authErrorMessage(error)).toBe(message);
  });
});

describe('auth actions', () => {
  it('signs up with a redirect back to the app', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: null });
    await expect(mod.signUp('a@b.co', 'password1')).resolves.toBeNull();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co', password: 'password1', options: { emailRedirectTo: window.location.origin },
    });
  });

  it('rejects short passwords before calling Supabase', async () => {
    await expect(mod.signUp('a@b.co', 'short')).resolves.toBe('Password must be at least 8 characters');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('returns mapped sign-in errors', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } });
    await expect(mod.signIn('a@b.co', 'password1')).resolves.toBe('Wrong email or password');
  });

  it('tracks session and recovery events', () => {
    let listener!: (event: string, session: unknown) => void;
    auth.onAuthStateChange.mockImplementation((fn) => { listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    mod.initAuth();
    listener('INITIAL_SESSION', null);
    expect(mod.useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });
    listener('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@b.co' } });
    expect(mod.useAuthStore.getState()).toMatchObject({ status: 'signedIn', recovery: true, user: { id: 'u1', email: 'a@b.co' } });
  });

  it('signOut clears the local board even if the network call fails', async () => {
    auth.signOut.mockRejectedValue(new TypeError('Failed to fetch'));
    useAppStore.getState().beginSession('u1', useAppStore.getState().data, { dirty: true, baseRevision: 1, localUpdatedAt: 'x' });
    await mod.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAppStore.getState().ownerId).toBeNull();
    expect(useAppStore.getState().sync).toEqual(INITIAL_SYNC);
    expect(mod.useAuthStore.getState().status).toBe('signedOut');
  });
});
