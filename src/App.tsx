import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';
import { Board } from './components/Board';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [, setPanel] = useState<Panel | null>(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
      <PlayerBar onOpen={setPanel} />
      <Board />
    </div>
  );
}
