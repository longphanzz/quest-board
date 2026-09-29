import { useAppStore } from '../store/useAppStore';
import { shouldShowBackupReminder } from '../store/persistence';
import { downloadBackup } from '../store/backup';

export function BackupBanner() {
  const data = useAppStore((s) => s.data);
  const snoozeBackup = useAppStore((s) => s.snoozeBackup);
  if (!shouldShowBackupReminder(data, new Date())) return null;
  return (
    <div className="backup-banner pixel-box" role="status">
      <p>💾 Your quests only live in this browser. Save a backup file!</p>
      <button className="pixel-btn primary" onClick={() => downloadBackup()}>Export now</button>
      <button className="pixel-btn ghost" onClick={snoozeBackup}>Later</button>
    </div>
  );
}
