import { useCallback, useEffect, useState } from 'react';
import { linkGoogle, listSignInMethods, unlinkGoogle, type SignInMethod } from '../cloud/auth';

/** Settings rows for the account's sign-in methods, with Link / Unlink Google. */
export function SignInMethods() {
  const [methods, setMethods] = useState<SignInMethod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listSignInMethods();
    if (typeof result === 'string') setError(result);
    else setMethods(result);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await action();
    if (err) setError(err);
    else await refresh();
    setBusy(false);
  };

  const email = methods?.find((m) => m.provider === 'email');
  const google = methods?.find((m) => m.provider === 'google');
  const canUnlink = (methods?.length ?? 0) > 1;

  const onUnlink = () => {
    if (!window.confirm(`Unlink Google (${google?.email ?? 'account'})? You will no longer be able to sign in with it.`)) return;
    void run(unlinkGoogle);
  };

  return (
    <div className="sign-in-methods">
      {methods === null && !error && <p className="settings-note">Loading sign-in methods…</p>}
      {methods && (
        <ul className="method-list">
          <li>✉️ Email — {email ? '✅ linked' : 'not linked'}</li>
          <li>
            <span className="google-g" aria-hidden="true">G</span> Google — {google ? `✅ ${google.email ?? 'linked'}` : 'not linked'}
          </li>
        </ul>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {methods && (
        <div className="row">
          {!google && <button className="pixel-btn" disabled={busy} onClick={() => void run(linkGoogle)}>Link Google account</button>}
          {google && canUnlink && <button className="pixel-btn ghost" disabled={busy} onClick={onUnlink}>Unlink Google</button>}
        </div>
      )}
    </div>
  );
}
