import type { CSSProperties } from 'react';
import { useEffectsStore, type EffectItem } from '../store/useEffectsStore';
import { ACHIEVEMENTS } from '../game/achievements';
import './Effects.css';

function XpBurst({ xp, boss }: { xp: number; boss: boolean }) {
  const count = boss ? 20 : 12;
  return (
    <div className="xp-burst">
      <div className="xp-float">+{xp} XP{boss ? ' 💀' : ''}</div>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="particle"
          style={{ '--angle': `${(360 / count) * i}deg`, '--dist': `${40 + (i % 3) * 18}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Overlay({ item }: { item: EffectItem }) {
  const { event } = item;
  switch (event.type) {
    case 'questCompleted':
      return <XpBurst xp={event.xp} boss={event.difficulty === 'boss'} />;
    case 'questUncompleted':
      return <div className="xp-float negative">-{event.xp} XP</div>;
    case 'levelUp':
      return (
        <div className="level-up-overlay" role="status">
          <div className="level-up-text">LEVEL UP!</div>
          <div className="level-up-level">LV {event.level}</div>
        </div>
      );
    default:
      return null;
  }
}

function Toast({ item }: { item: EffectItem }) {
  const { event } = item;
  if (event.type === 'toast') {
    return (
      <div className={`toast toast-${event.tone}`} role={event.tone === 'error' ? 'alert' : 'status'}>
        {event.message}
      </div>
    );
  }
  if (event.type !== 'achievement') return null;
  const achievement = ACHIEVEMENTS.find((a) => a.id === event.id);
  if (!achievement) return null;
  return (
    <div className="toast achievement-toast" role="status">
      <span className="toast-icon">{achievement.icon}</span>
      <div>
        <div className="toast-title">🏆 ACHIEVEMENT UNLOCKED</div>
        <div>{achievement.name}</div>
      </div>
    </div>
  );
}

export function EffectsLayer() {
  const items = useEffectsStore((s) => s.items);
  return (
    <>
      <div className="effects-layer">
        {items.map((item) => <Overlay key={item.key} item={item} />)}
      </div>
      <div className="toast-stack">
        {items.map((item) => <Toast key={item.key} item={item} />)}
      </div>
    </>
  );
}
