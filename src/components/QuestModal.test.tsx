import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestModal } from './QuestModal';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { createDefaultData } from '../store/defaults';

let questId = '';
beforeEach(() => {
  const data = createDefaultData();
  questId = data.columns[0].questIds[0];
  useAppStore.setState({ data });
  useEffectsStore.setState({ items: [], mood: null });
});
afterEach(() => vi.restoreAllMocks());

const quest = () => useAppStore.getState().data.quests[questId];

describe('QuestModal', () => {
  it('edits title, difficulty, deadline and a new label', async () => {
    const onClose = vi.fn();
    render(<QuestModal questId={questId} onClose={onClose} />);
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Viết báo cáo');
    await userEvent.click(screen.getByRole('button', { name: /Boss/ }));
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-10-01' } });
    await userEvent.type(screen.getByLabelText('New label name'), 'Work');
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(quest()).toMatchObject({ title: 'Viết báo cáo', difficulty: 'boss', deadline: '2026-10-01' });
    expect(quest().labelIds).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open and the quest unchanged when the title is only spaces', async () => {
    const onClose = vi.fn();
    const before = quest().title;
    render(<QuestModal questId={questId} onClose={onClose} />);
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(quest().title).toBe(before);
    expect(useEffectsStore.getState().items.at(-1)?.event).toMatchObject({ tone: 'error' });
  });

  it('deletes after confirmation and closes on Escape', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    render(<QuestModal questId={questId} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(quest()).toBeUndefined();
  });
});
