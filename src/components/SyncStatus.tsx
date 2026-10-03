import { useSyncStore } from '../cloud/useSyncStore';

const VIEW = {
  synced: { icon: '☁️', label: 'Synced' },
  saving: { icon: '⏳', label: 'Saving…' },
  offline: { icon: '📴', label: 'Offline — saved on this device' },
  error: { icon: '⚠️', label: 'Sync error — click to retry' },
} as const;

export function SyncStatus() {
  const status = useSyncStore((s) => s.status);
  const retry = useSyncStore((s) => s.retry);
  const { icon, label } = VIEW[status];
  if (status === 'error') {
    return <button className="pixel-btn icon sync-status" title={label} aria-label={label} onClick={() => retry?.()}>{icon}</button>;
  }
  return <span className="sync-status" role="status" title={label} aria-label={label}>{icon}</span>;
}
