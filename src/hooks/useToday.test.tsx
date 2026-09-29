import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useToday } from './useToday';

function Show() {
  return <span>{useToday()}</span>;
}

afterEach(() => vi.useRealTimers());

describe('useToday', () => {
  it('re-renders with the new date after midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 23, 59, 58));
    render(<Show />);
    expect(screen.getByText('2026-09-29')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();
  });
});
