import { useAppStore } from '../store/useAppStore';
import { ACHIEVEMENTS } from '../game/achievements';
import { Modal } from './Modal';

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const unlocked = useAppStore((s) => s.data.player.unlockedAchievements);
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <Modal title={`Achievements ${count}/${ACHIEVEMENTS.length}`} onClose={onClose} wide>
      <ul className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          return (
            <li key={a.id} className={`achievement ${at ? 'unlocked' : 'locked'}`}>
              <span className="badge" aria-hidden="true">{a.icon}</span>
              <div>
                <div className="achievement-name">{a.name}</div>
                <div className="achievement-desc">{a.description}</div>
                {at && <div className="achievement-date">Unlocked {new Date(at).toLocaleDateString()}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
