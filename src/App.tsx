import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';
import { Board } from './components/Board';
import { EffectsLayer } from './components/EffectsLayer';
import { AchievementsPanel } from './components/AchievementsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PixelEditor } from './components/PixelEditor';
import { ReloadPrompt } from './components/ReloadPrompt';
import { CloudGate } from './components/CloudGate';
import { UndoBar } from './components/UndoBar';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <>
      <CloudGate>
        <div className="app">
          <h1 className="sr-only">Quest Board</h1>
          <PlayerBar onOpen={setPanel} />
          <Board />
          <EffectsLayer />
          <UndoBar />
          {panel === 'achievements' && <AchievementsPanel onClose={close} />}
          {panel === 'settings' && <SettingsPanel onClose={close} onEditAvatar={() => setPanel('editor')} />}
          {panel === 'editor' && <PixelEditor onClose={close} />}
        </div>
      </CloudGate>
      <ReloadPrompt />
    </>
  );
}
