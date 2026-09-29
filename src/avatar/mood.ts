import type { AvatarFrames, Frame, Mood } from '../types';
import type { TransientMood } from '../store/useEffectsStore';
import { createMascotFrames } from './mascot';

export const MASCOT = createMascotFrames();

export interface MoodInput {
  now: number;
  transient: TransientMood | null;
  streakBroken: boolean;
  overdueCount: number;
}

export type AvatarAnimation = 'bounce' | 'jump' | 'shake' | null;

export function selectMood(input: MoodInput): Mood {
  if (input.transient && input.now < input.transient.until) return input.transient.mood;
  if (input.streakBroken || input.overdueCount > 0) return 'sad';
  return 'normal';
}

export function resolveFrame(
  frames: AvatarFrames,
  mood: Mood,
  mascot: Record<Mood, Frame>,
): { frame: Frame; animation: AvatarAnimation } {
  const cheer: AvatarAnimation = mood === 'happy' ? 'bounce' : mood === 'levelUp' ? 'jump' : null;
  if (!frames.normal) return { frame: mascot[mood], animation: cheer };
  const own = frames[mood];
  if (own) return { frame: own, animation: cheer };
  return { frame: frames.normal, animation: mood === 'sad' ? 'shake' : cheer };
}
