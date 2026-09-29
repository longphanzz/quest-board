import { useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { downloadBackup, readBackupFile } from '../store/backup';
import { playSfx } from '../audio/sfx';
import { Modal } from './Modal';

interface Props { onClose: () => void; onEditAvatar: () => void; }

export function SettingsPanel({ onClose, onEditAvatar }: Props) {
  const settings = useAppStore((s) => s.data.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const replaceData = useAppStore((s) => s.replaceData);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const effects = useEffectsStore.getState();
    const result = await readBackupFile(file);
    if (!result.ok) {
      effects.toast(result.error, 'error');
      return;
    }
    if (!window.confirm('Replace ALL current quests and progress with this backup?')) return;
    replaceData(result.data);
    effects.toast('Backup restored!');
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Sound</h3>
        <label className="range-row">
          Effects volume
          <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume}
            onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.musicOn} onChange={(e) => updateSettings({ musicOn: e.target.checked })} />
          Background music
        </label>
        <label className="range-row">
          Music volume
          <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume}
            onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })} />
        </label>
        <div className="row">
          <button className="pixel-btn ghost" onClick={() => playSfx('complete')}>Test sound</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Theme</h3>
        <div className="row">
          <button className="pixel-btn" aria-pressed={settings.theme === 'dark'} onClick={() => updateSettings({ theme: 'dark' })}>Dark</button>
          <button className="pixel-btn" aria-pressed={settings.theme === 'light'} onClick={() => updateSettings({ theme: 'light' })}>Light</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Avatar</h3>
        <div className="row">
          <button className="pixel-btn" onClick={onEditAvatar}>🎨 Edit avatar</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Backup</h3>
        <p className="settings-note">
          {settings.lastExportAt ? `Last export: ${new Date(settings.lastExportAt).toLocaleString()}` : 'Never exported yet.'}
        </p>
        <div className="row">
          <button className="pixel-btn primary" onClick={() => downloadBackup()}>💾 Export</button>
          <button className="pixel-btn" onClick={() => fileRef.current?.click()}>📂 Import</button>
        </div>
        <input ref={fileRef} data-testid="import-input" type="file" accept="application/json,.json" hidden onChange={onImport} />
      </section>
    </Modal>
  );
}
