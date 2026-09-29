import { useAppStore } from '../store/useAppStore';
import { levelProgress } from '../game/level';
import { displayedStreak } from '../game/streak';
import { useToday } from '../hooks/useToday';
import { PlayerAvatar } from './PlayerAvatar';
import './PlayerBar.css';

export type Panel = 'achievements' | 'settings' | 'editor';

export function PlayerBar({ onOpen }: { onOpen: (panel: Panel) => void }) {
  const player = useAppStore((s) => s.data.player);
  const muted = useAppStore((s) => s.data.settings.muted);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const today = useToday();

  const { level, current, needed } = levelProgress(player.totalXp);
  const streak = displayedStreak(player, today);

  return (
    <header className="player-bar pixel-box">
      <button className="avatar-button" onClick={() => onOpen('editor')} aria-label="Edit avatar">
        <PlayerAvatar size={64} />
      </button>
      <div className="player-stats">
        <div className="player-level">LV {level}</div>
        <div className="xp-bar" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuenow={current} aria-valuemax={needed}>
          <div className="xp-fill" style={{ width: `${(current / needed) * 100}%` }} />
        </div>
        <div className="xp-text">XP {current}/{needed}</div>
      </div>
      <div className="player-streak" title="Daily streak">
        🔥 {streak}
        {player.shields > 0 && (
          <span className="shields" title={`${player.shields} streak shield(s)`}>{' '}{'🛡️'.repeat(player.shields)}</span>
        )}
      </div>
      <nav className="player-actions">
        <button className="pixel-btn icon" onClick={() => onOpen('achievements')} aria-label="Achievements">🏆</button>
        <button className="pixel-btn icon" onClick={() => onOpen('settings')} aria-label="Settings">⚙️</button>
        <button className="pixel-btn icon" onClick={() => updateSettings({ muted: !muted })} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </nav>
    </header>
  );
}
