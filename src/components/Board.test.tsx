import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Board } from './Board';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

beforeEach(() => useAppStore.setState({ data: createDefaultData() }));
afterEach(() => vi.restoreAllMocks());

const column = (name: string) => screen.getByRole('region', { name: `${name} column` });

describe('Board', () => {
  it('renders the three default columns and the welcome quest', () => {
    render(<Board />);
    expect(column('To Do')).toBeInTheDocument();
    expect(column('Doing')).toBeInTheDocument();
    expect(column('Done')).toBeInTheDocument();
    expect(screen.getByText(/Welcome, hero!/)).toBeInTheDocument();
  });

  it('quick-adds a quest with Vietnamese text', async () => {
    render(<Board />);
    await userEvent.click(within(column('Doing')).getByRole('button', { name: '+ New Quest' }));
    await userEvent.type(screen.getByLabelText('New quest title'), 'Hạ gục con boss cuối{Enter}');
    expect(within(column('Doing')).getByText(/Hạ gục con boss cuối/)).toBeInTheDocument();
    expect(useAppStore.getState().data.columns[1].questIds).toHaveLength(1);
  });

  it('adds and renames a column', async () => {
    render(<Board />);
    await userEvent.click(screen.getByRole('button', { name: '+ Column' }));
    await userEvent.click(within(column('New Column')).getByLabelText('New Column options'));
    await userEvent.click(within(column('New Column')).getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Column name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Backlog{Enter}');
    expect(column('Backlog')).toBeInTheDocument();
  });

  it('makes another column the Done column and blocks deleting it', async () => {
    render(<Board />);
    await userEvent.click(within(column('Doing')).getByLabelText('Doing options'));
    await userEvent.click(within(column('Doing')).getByRole('button', { name: 'Make Done column' }));
    expect(useAppStore.getState().data.columns.find((c) => c.isDone)?.name).toBe('Doing');
    expect(within(column('Doing')).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('opens the quest editor when a card is clicked', async () => {
    render(<Board />);
    await userEvent.click(screen.getByText(/Welcome, hero!/));
    expect(screen.getByRole('dialog', { name: 'Edit Quest' })).toBeInTheDocument();
  });

  it('asks before deleting a column that holds quests', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Board />);
    await userEvent.click(within(column('To Do')).getByLabelText('To Do options'));
    await userEvent.click(within(column('To Do')).getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalled();
    expect(useAppStore.getState().data.columns).toHaveLength(3);
  });
});
