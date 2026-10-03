import { useState, type FormEvent } from 'react';
import { updatePassword, MIN_PASSWORD } from '../cloud/auth';
import './Auth.css';

export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(await updatePassword(password));
    setBusy(false);
  };

  return (
    <main className="auth-screen">
      <form className="auth-card auth-form pixel-box" onSubmit={submit}>
        <h1 className="auth-title">NEW PASSWORD</h1>
        <label>
          New password
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Repeat new password
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="pixel-btn primary" disabled={busy}>Save new password</button>
      </form>
    </main>
  );
}
