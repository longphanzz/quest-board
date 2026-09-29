import { backupFileName, parseBackup, serialize, type ImportResult } from './persistence';
import { useAppStore } from './useAppStore';

export function downloadBackup(now: Date = new Date()): void {
  const blob = new Blob([serialize(useAppStore.getState().data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(now);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  useAppStore.getState().markExported();
}

function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function readBackupFile(file: Blob): Promise<ImportResult> {
  try {
    return parseBackup(await readText(file));
  } catch {
    return { ok: false, error: 'Could not read that file.' };
  }
}
