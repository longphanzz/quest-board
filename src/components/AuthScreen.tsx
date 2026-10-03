import { useState, type FormEvent } from 'react';
import { requestPasswordReset, signIn, signUp, MIN_PASSWORD } from '../cloud/auth';
import './Auth.css';

type Mode = 'signIn' | 'signUp' | 'forgot';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setNote(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    const trimmed = email.trim();
    if (mode === 'signIn') setError(await signIn(trimmed, password));
    if (mode === 'signUp') {
      const err = await signUp(trimmed, password);
      if (err) setError(err);
      else setNote('Check your email to confirm your account');
    }
    if (mode === 'forgot') {
      const err = await requestPasswordReset(trimmed);
      if (err === 'No connection') setError(err);
      else setNote('If that email has an account, a reset link is on its way');
    }
    setBusy(false);
  };

  const action = mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Send reset link';

  return (
    <main className="auth-screen">
      <div className="auth-card pixel-box">
        <h1 className="auth-title">QUEST BOARD</h1>
        <p className="auth-sub">Press Start</p>
        {mode !== 'forgot' && (
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" className="pixel-btn" aria-selected={mode === 'signIn'} aria-pressed={mode === 'signIn'} onClick={() => switchTo('signIn')}>Sign in</button>
            <button type="button" role="tab" className="pixel-btn" aria-selected={mode === 'signUp'} aria-pressed={mode === 'signUp'} onClick={() => switchTo('signUp')}>Sign up</button>
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && (
            <label>
              Password
              <input type="password" required minLength={mode === 'signUp' ? MIN_PASSWORD : undefined}
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {note && <p className="auth-note" role="status">{note}</p>}
          <button type="submit" className="pixel-btn primary" disabled={busy}>{action}</button>
        </form>
        {mode === 'signIn' && <button type="button" className="auth-link" onClick={() => switchTo('forgot')}>Forgot password?</button>}
        {mode === 'forgot' && <button type="button" className="auth-link" onClick={() => switchTo('signIn')}>Back to sign in</button>}
      </div>
    </main>
  );
}
