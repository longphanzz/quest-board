import { useEffect, type ReactNode } from 'react';
import { initAuth, useAuthStore } from '../cloud/auth';
import { useCloudSync } from '../cloud/useCloudSync';
import { useAppStore } from '../store/useAppStore';
import { AuthScreen } from './AuthScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { FirstSyncPrompt } from './FirstSyncPrompt';
import './Auth.css';

function Synced({ userId, children }: { userId: string; children: ReactNode }) {
  useCloudSync(userId);
  return <>{children}</>;
}

export function CloudGate({ children }: { children: ReactNode }) {
  const { status, user, recovery } = useAuthStore();
  const ownerId = useAppStore((s) => s.ownerId);

  useEffect(() => initAuth(), []);

  if (status === 'loading') return <main className="auth-screen"><p className="auth-sub">Loading…</p></main>;
  if (status === 'signedOut' || !user) return <AuthScreen />;
  if (recovery) return <ResetPasswordScreen />;
  if (ownerId !== user.id) return <FirstSyncPrompt userId={user.id} />;
  return <Synced userId={user.id}>{children}</Synced>;
}
