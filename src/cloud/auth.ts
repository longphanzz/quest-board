import { create } from 'zustand';
import { getSupabase, getSupabaseEnv } from './client';
import { useAppStore } from '../store/useAppStore';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
export interface AuthUser { id: string; email: string }
interface AuthState { status: AuthStatus; user: AuthUser | null; recovery: boolean }

export const useAuthStore = create<AuthState>(() => ({ status: 'loading', user: null, recovery: false }));
export const MIN_PASSWORD = 8;
const SHORT = `Password must be at least ${MIN_PASSWORD} characters`;

export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { code?: string; name?: string; message?: string };
  if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(e.message ?? '')) return 'No connection';
  switch (e.code) {
    case 'invalid_credentials': return 'Wrong email or password';
    case 'email_not_confirmed': return 'Email not confirmed yet';
    case 'user_already_exists': return 'That email already has an account';
    case 'weak_password': return 'Password is too weak';
    case 'identity_already_exists': return 'That Google account already belongs to another user';
    case 'manual_linking_disabled': return 'Account linking is turned off in Supabase settings';
    case 'single_identity_not_deletable': return 'Add another way to sign in before unlinking this one';
    default: return 'Something went wrong — try again';
  }
}

type Session = { user: { id: string; email?: string } } | null;

export function initAuth(): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event: string, session: Session) => {
    const user = session ? { id: session.user.id, email: session.user.email ?? '' } : null;
    useAuthStore.setState((s) => ({
      status: user ? 'signedIn' : 'signedOut',
      user,
      recovery: event === 'PASSWORD_RECOVERY' ? true : user ? s.recovery : false,
    }));
  });
  return () => data.subscription.unsubscribe();
}

async function attempt(fn: () => Promise<{ error: unknown }>): Promise<string | null> {
  try {
    const { error } = await fn();
    return error ? authErrorMessage(error) : null;
  } catch (e) {
    return authErrorMessage(e);
  }
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD) return SHORT;
  return attempt(() =>
    getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }),
  );
}

export const signIn = (email: string, password: string) =>
  attempt(() => getSupabase().auth.signInWithPassword({ email, password }));

export const requestPasswordReset = (email: string) =>
  attempt(() => getSupabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }));

export async function updatePassword(password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD) return SHORT;
  const error = await attempt(() => getSupabase().auth.updateUser({ password }));
  if (!error) useAuthStore.setState({ recovery: false });
  return error;
}

/** Signing out always wipes this device's board copy, even when offline. */
export async function signOut(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch {
    /* the local session is removed regardless */
  }
  useAppStore.getState().clearLocalBoard();
  useAuthStore.setState({ status: 'signedOut', user: null, recovery: false });
}

const NOT_SET_UP = 'Google sign-in is not set up yet';

/** Asks Supabase whether the Google provider is on, so a click never lands on a raw error page. */
async function googleEnabled(): Promise<boolean> {
  const { url, key } = getSupabaseEnv();
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  const settings = (await response.json()) as { external?: { google?: boolean } };
  return settings.external?.google === true;
}

async function withGoogle(start: () => Promise<{ error: unknown }>): Promise<string | null> {
  try {
    if (!(await googleEnabled())) return NOT_SET_UP;
  } catch (e) {
    return authErrorMessage(e);
  }
  return attempt(start);
}

const googleRedirect = () => ({ provider: 'google' as const, options: { redirectTo: window.location.origin } });

export const signInWithGoogle = () => withGoogle(() => getSupabase().auth.signInWithOAuth(googleRedirect()));

/** Adds Google as a second way into the signed-in account (needs "Allow manual linking" in Supabase). */
export const linkGoogle = () => withGoogle(() => getSupabase().auth.linkIdentity(googleRedirect()));

export interface SignInMethod { provider: string; email: string | null }

type Identity = { provider: string; identity_data?: { email?: string } };

async function identities(): Promise<Identity[]> {
  const { data, error } = await getSupabase().auth.getUserIdentities();
  if (error) throw error;
  return (data?.identities ?? []) as Identity[];
}

/** The ways the current user can sign in, or an error message. */
export async function listSignInMethods(): Promise<SignInMethod[] | string> {
  try {
    return (await identities()).map((i) => ({ provider: i.provider, email: i.identity_data?.email ?? null }));
  } catch (e) {
    return authErrorMessage(e);
  }
}

export async function unlinkGoogle(): Promise<string | null> {
  try {
    const google = (await identities()).find((i) => i.provider === 'google');
    if (!google) return null;
    return attempt(() => getSupabase().auth.unlinkIdentity(google as never));
  } catch (e) {
    return authErrorMessage(e);
  }
}
