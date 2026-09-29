import { useEffect, useReducer } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { toDateKey } from '../game/dates';
import { isStreakBroken } from '../game/streak';
import { isOverdue } from '../game/deadline';
import { MASCOT, resolveFrame, selectMood } from '../avatar/mood';
import { PixelCanvas } from './PixelCanvas';

export function PlayerAvatar({ size }: { size: number }) {
  const frames = useAppStore((s) => s.data.avatar.frames);
  const player = useAppStore((s) => s.data.player);
  const quests = useAppStore((s) => s.data.quests);
  const transient = useEffectsStore((s) => s.mood);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!transient) return;
    const ms = transient.until - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(rerender, ms + 20);
    return () => clearTimeout(timer);
  }, [transient]);

  const today = toDateKey(new Date());
  const overdueCount = Object.values(quests).filter((q) => isOverdue(q, today)).length;
  const mood = selectMood({ now: Date.now(), transient, streakBroken: isStreakBroken(player, today), overdueCount });
  const { frame, animation } = resolveFrame(frames, mood, MASCOT);

  return (
    <div className={`player-avatar ${animation ? `anim-${animation}` : ''}`} data-mood={mood}>
      <PixelCanvas frame={frame} size={size} label={`Your avatar (${mood})`} />
    </div>
  );
}
