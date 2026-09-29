import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerBar } from './PlayerBar';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import { toDateKey } from '../game/dates';

beforeEach(() => {
  const data = createDefaultData();
  data.player = { ...data.player, totalXp: 350, streak: 4, shields: 1, lastActiveDate: toDateKey(new Date()) };
  useAppStore.setState({ data });
});

describe('PlayerBar', () => {
  it('shows level, XP progress and streak', () => {
    render(<PlayerBar onOpen={() => {}} />);
    expect(screen.getByText('LV 3')).toBeInTheDocument();
    expect(screen.getByText('XP 50/300')).toBeInTheDocument();
    expect(screen.getByTitle('Daily streak')).toHaveTextContent('4');
    expect(screen.getByRole('progressbar', { name: 'Experience' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('opens panels and toggles mute', async () => {
    const onOpen = vi.fn();
    render(<PlayerBar onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit avatar' }));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['achievements', 'settings', 'editor']);
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(useAppStore.getState().data.settings.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });

  it('updates when a quest is completed', () => {
    useAppStore.setState({ data: createDefaultData() });
    render(<PlayerBar onOpen={() => {}} />);
    const { columns } = useAppStore.getState().data;
    act(() => useAppStore.getState().moveQuest(columns[0].questIds[0], columns[2].id, 0));
    expect(screen.getByText('XP 11/100')).toBeInTheDocument(); // easy welcome quest: 10 * 1.05
  });
});
