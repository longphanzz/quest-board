import { create } from 'zustand';
import { getSupabase } from './client';
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
