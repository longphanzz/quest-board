import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from './SettingsPanel';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { createDefaultData } from '../store/defaults';
import { serialize } from '../store/persistence';

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData() });
  useEffectsStore.setState({ items: [], mood: null });
});
afterEach(() => vi.restoreAllMocks());

const settings = () => useAppStore.getState().data.settings;

describe('SettingsPanel', () => {
  it('changes theme and music settings', async () => {
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(settings().theme).toBe('light');
    await userEvent.click(screen.getByLabelText('Background music'));
    expect(settings().musicOn).toBe(true);
  });

  it('imports a valid backup after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const backup = createDefaultData();
    backup.player.totalXp = 777;
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    const file = new File([serialize(backup)], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [file] } });
    await waitFor(() => expect(useAppStore.getState().data.player.totalXp).toBe(777));
  });

  it('rejects a broken backup and keeps current data', async () => {
    const before = useAppStore.getState().data;
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    fireEvent.change(screen.getByTestId('import-input'), {
      target: { files: [new File(['{nope'], 'bad.json', { type: 'application/json' })] },
    });
    await waitFor(() =>
      expect(useEffectsStore.getState().items.at(-1)?.event).toEqual({ type: 'toast', message: 'This file is not valid JSON.', tone: 'error' }),
    );
    expect(useAppStore.getState().data).toBe(before);
  });
});
