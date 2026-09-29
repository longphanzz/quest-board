import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';
import { Board } from './components/Board';
import { BackupBanner } from './components/BackupBanner';
import { EffectsLayer } from './components/EffectsLayer';
import { AchievementsPanel } from './components/AchievementsPanel';
import { PixelEditor } from './components/PixelEditor';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
      <PlayerBar onOpen={setPanel} />
      <BackupBanner />
      <Board />
      <EffectsLayer />
      {panel === 'achievements' && <AchievementsPanel onClose={close} />}
      {panel === 'settings' && <SettingsPanel onClose={close} onEditAvatar={() => setPanel('editor')} />}
      {panel === 'editor' && <PixelEditor onClose={close} />}
    </div>
  );
}
