import { describe, expect, it } from 'vitest';
import { formatDateTime, formatShortDate, formatToday, isoToDateKey } from './formatDate';

describe('formatDate', () => {
  it('formats today with a weekday', () => {
    expect(formatToday('2026-09-29')).toBe('Tue 29/09/2026');
    expect(formatToday('2027-01-03')).toBe('Sun 03/01/2027');
  });
  it('hides the year when it is the current year', () => {
    expect(formatShortDate('2026-10-03', '2026-09-29')).toBe('03/10');
    expect(formatShortDate('2027-01-15', '2026-12-30')).toBe('15/01/2027');
  });
  it('formats a local date and time from an ISO string', () => {
    const iso = new Date(2026, 8, 29, 9, 5).toISOString();
    expect(formatDateTime(iso)).toBe('29/09/2026 09:05');
    expect(isoToDateKey(iso)).toBe('2026-09-29');
  });
});
