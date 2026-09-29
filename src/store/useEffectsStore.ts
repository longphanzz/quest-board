import { create } from 'zustand';
import type { GameEvent } from '../types';
import { playSfx, type SfxName } from '../audio/sfx';

export type ToastTone = 'info' | 'error';
export type UiEvent = GameEvent | { type: 'toast'; message: string; tone: ToastTone };
export interface EffectItem { key: number; event: UiEvent; }
export interface TransientMood { mood: 'happy' | 'levelUp'; until: number; }

const DURATION: Record<UiEvent['type'], number> = {
  questCompleted: 1600,
  questUncompleted: 1600,
  levelUp: 2800,
  achievement: 4000,
  toast: 4500,
};

function soundFor(event: GameEvent): { name: SfxName; delay: number } {
  switch (event.type) {
    case 'questCompleted': return { name: event.difficulty === 'boss' ? 'boss' : 'complete', delay: 0 };
    case 'questUncompleted': return { name: 'uncomplete', delay: 0 };
    case 'levelUp': return { name: 'levelUp', delay: 450 };
    case 'achievement': return { name: 'achievement', delay: 1100 };
  }
}

interface EffectsState {
  items: EffectItem[];
  mood: TransientMood | null;
  push: (events: GameEvent[]) => void;
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (key: number) => void;
}

let nextKey = 1;

export const useEffectsStore = create<EffectsState>()((set, get) => {
  const add = (events: UiEvent[]) => {
    const added = events.map((event) => ({ key: nextKey++, event }));
    set((s) => ({ items: [...s.items, ...added] }));
    for (const item of added) setTimeout(() => get().dismiss(item.key), DURATION[item.event.type]);
  };
  return {
    items: [],
    mood: null,
    push: (events) => {
      if (events.length === 0) return;
      for (const event of events) {
        const sound = soundFor(event);
        setTimeout(() => playSfx(sound.name), sound.delay);
      }
      const now = Date.now();
      if (events.some((e) => e.type === 'levelUp')) set({ mood: { mood: 'levelUp', until: now + 3000 } });
      else if (events.some((e) => e.type === 'questCompleted')) set({ mood: { mood: 'happy', until: now + 2000 } });
      add(events);
    },
    toast: (message, tone = 'info') => add([{ type: 'toast', message, tone }]),
    dismiss: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
  };
});
