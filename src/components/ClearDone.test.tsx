import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColumnMenu } from './ColumnMenu';
import { UndoBar } from './UndoBar';
import { useAppStore, INITIAL_SYNC } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

const app = () => useAppStore.getState();
const done = () => app().data.columns[2];

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC }, lastCleared: null });
  const { columns } = app().data;
  app().moveQuest(columns[0].questIds[0], columns[2].id, 0);
});
afterEach(() => vi.restoreAllMocks());

describe('Clear done quests', () => {
  it('is offered only in the Done column menu and asks first', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { rerender } = render(<ColumnMenu column={app().data.columns[0]} onRename={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear done quests' })).not.toBeInTheDocument();
    rerender(<ColumnMenu column={done()} onRename={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear done quests' }));
    expect(confirm).toHaveBeenCalledWith('Delete 1 completed quest? Your XP, level and achievements are kept.');
    expect(done().questIds).toHaveLength(1);
  });

  it('clears after confirmation and is disabled when Done is empty', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { rerender } = render(<ColumnMenu column={done()} onRename={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear done quests' }));
    expect(done().questIds).toHaveLength(0);
    rerender(<ColumnMenu column={done()} onRename={() => {}} />);
    expect(screen.getByRole('button', { name: 'Clear done quests' })).toBeDisabled();
  });
});

describe('UndoBar', () => {
  it('shows after clearing and Undo brings the quests back', async () => {
    render(<UndoBar />);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    act(() => void app().clearDoneQuests());
    expect(screen.getByText('Cleared 1 quest')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(done().questIds).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('disappears by itself after 5 seconds', () => {
    vi.useFakeTimers();
    try {
      render(<UndoBar />);
      act(() => void app().clearDoneQuests());
      act(() => vi.advanceTimersByTime(4900));
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
      expect(app().lastCleared).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
