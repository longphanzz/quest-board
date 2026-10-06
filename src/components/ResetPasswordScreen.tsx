import { useState, type FormEvent } from 'react';
import { updatePassword, MIN_PASSWORD } from '../cloud/auth';
import { PasswordInput } from './PasswordInput';
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
        <PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={MIN_PASSWORD} />
        <PasswordInput label="Repeat new password" value={repeat} onChange={setRepeat} autoComplete="new-password" minLength={MIN_PASSWORD} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="pixel-btn primary" disabled={busy}>Save new password</button>
      </form>
    </main>
  );
}
