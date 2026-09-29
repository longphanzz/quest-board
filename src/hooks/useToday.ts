import { useSyncExternalStore } from 'react';
import type { DateKey } from '../types';
import { toDateKey } from '../game/dates';

// One shared timer re-renders every subscriber just after local midnight,
// so streaks, deadlines and the avatar mood never show yesterday's state.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  timer = setTimeout(() => {
    listeners.forEach((listener) => listener());
    schedule();
  }, nextMidnight.getTime() - now.getTime());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const getToday = (): DateKey => toDateKey(new Date());

export function useToday(): DateKey {
  return useSyncExternalStore(subscribe, getToday);
}
