import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { EffectsLayer } from './EffectsLayer';
import { AchievementsPanel } from './AchievementsPanel';
import { useEffectsStore } from '../store/useEffectsStore';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

beforeEach(() => {
  useEffectsStore.setState({ items: [], mood: null });
  useAppStore.setState({ data: createDefaultData() });
});

describe('EffectsLayer', () => {
  it('shows XP gain, level up and achievement toasts', () => {
    render(<EffectsLayer />);
    act(() =>
      useEffectsStore.getState().push([
        { type: 'questCompleted', questId: 'q', xp: 26, difficulty: 'normal' },
        { type: 'levelUp', level: 3 },
        { type: 'achievement', id: 'first-blood' },
      ]),
    );
    expect(screen.getByText('+26 XP')).toBeInTheDocument();
    expect(screen.getByText('LEVEL UP!')).toBeInTheDocument();
    expect(screen.getByText('LV 3')).toBeInTheDocument();
    expect(screen.getByText('First Blood')).toBeInTheDocument();
  });

  it('shows error toasts as alerts', () => {
    render(<EffectsLayer />);
    act(() => useEffectsStore.getState().toast('Boom', 'error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });
});

describe('AchievementsPanel', () => {
  it('lists unlocked and locked achievements', () => {
    const data = createDefaultData();
    data.player.unlockedAchievements = { 'first-blood': new Date().toISOString() };
    useAppStore.setState({ data });
    render(<AchievementsPanel onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Achievements 1/12' })).toBeInTheDocument();
    expect(screen.getByText('First Blood').closest('li')).toHaveClass('unlocked');
    expect(screen.getByText('Boss Slayer').closest('li')).toHaveClass('locked');
  });
});
