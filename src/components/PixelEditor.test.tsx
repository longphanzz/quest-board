import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PixelEditor } from './PixelEditor';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import { MASCOT } from '../avatar/mood';

beforeEach(() => useAppStore.setState({ data: createDefaultData() }));
afterEach(() => vi.restoreAllMocks());

const frames = () => useAppStore.getState().data.avatar.frames;

describe('PixelEditor', () => {
  it('starts from the mascot and saves it as a custom frame', async () => {
    const onClose = vi.fn();
    render(<PixelEditor onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(frames().normal).toEqual(MASCOT.normal);
    expect(frames().happy).toBeNull();
    expect(useAppStore.getState().data.player.unlockedAchievements.artist).toBeDefined();
    expect(onClose).toHaveBeenCalled();
  });

  it('undo restores the empty frame', async () => {
    render(<PixelEditor onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(frames().normal).toBeNull();
  });

  it('copies Normal into another mood tab', async () => {
    render(<PixelEditor onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Sad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy from Normal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(frames().sad).toEqual(MASCOT.normal);
  });

  it('resets to default after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const data = createDefaultData();
    data.avatar.frames.normal = MASCOT.sad;
    useAppStore.setState({ data });
    render(<PixelEditor onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(frames().normal).toBeNull();
  });
});

describe('PixelEditor unsaved changes (review fix)', () => {
  it('asks before discarding a drawing and stays open when declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    render(<PixelEditor onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without asking when nothing changed', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onClose = vi.fn();
    render(<PixelEditor onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
