import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(), linkIdentity: vi.fn(), unlinkIdentity: vi.fn(), getUserIdentities: vi.fn(),
};
vi.mock('./client', () => ({
  getSupabase: () => ({ auth }),
  getSupabaseEnv: () => ({ url: 'https://x.supabase.co', key: 'pk' }),
}));

const mod = await import('./auth');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');

afterEach(() => {
  Object.values(auth).forEach((f) => f.mockReset());
  vi.unstubAllGlobals();
});

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

const googleEnabled = (on: boolean) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { google: on } }) }));

describe('Google sign-in and linking', () => {
  it('explains when Google is not set up instead of redirecting to an error page', async () => {
    googleEnabled(false);
    await expect(mod.signInWithGoogle()).resolves.toBe('Google sign-in is not set up yet');
    await expect(mod.linkGoogle()).resolves.toBe('Google sign-in is not set up yet');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/settings', { headers: { apikey: 'pk' } });
  });

  it('starts Google sign-in and linking with a redirect back to the app', async () => {
    googleEnabled(true);
    auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    await expect(mod.signInWithGoogle()).resolves.toBeNull();
    await expect(mod.linkGoogle()).resolves.toBeNull();
    const options = { provider: 'google', options: { redirectTo: window.location.origin } };
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(options);
    expect(auth.linkIdentity).toHaveBeenCalledWith(options);
  });

  it.each([
    [{ code: 'identity_already_exists' }, 'That Google account already belongs to another user'],
    [{ code: 'manual_linking_disabled' }, 'Account linking is turned off in Supabase settings'],
    [{ code: 'single_identity_not_deletable' }, 'Add another way to sign in before unlinking this one'],
  ])('maps linking error %o', (error, message) => {
    expect(mod.authErrorMessage(error)).toBe(message);
  });

  it('lists sign-in methods with their emails', async () => {
    auth.getUserIdentities.mockResolvedValue({
      data: { identities: [
        { provider: 'email', identity_data: { email: 'a@b.co' } },
        { provider: 'google', identity_data: { email: 'hero@gmail.com' } },
      ] },
      error: null,
    });
    await expect(mod.listSignInMethods()).resolves.toEqual([
      { provider: 'email', email: 'a@b.co' },
      { provider: 'google', email: 'hero@gmail.com' },
    ]);
  });

  it('unlinks the Google identity', async () => {
    const google = { provider: 'google', identity_id: 'g1', identity_data: {} };
    auth.getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: 'email' }, google] }, error: null });
    auth.unlinkIdentity.mockResolvedValue({ data: {}, error: null });
    await expect(mod.unlinkGoogle()).resolves.toBeNull();
    expect(auth.unlinkIdentity).toHaveBeenCalledWith(google);
  });
});
