import type { DateKey } from '../types';
import { toDateKey } from './dates';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (key: DateKey) => key.split('-').map(Number) as [number, number, number];

/** "Tue 29/09/2026" */
export function formatToday(key: DateKey): string {
  const [y, m, d] = parts(key);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${pad(d)}/${pad(m)}/${y}`;
}

/** "03/10", or "15/01/2027" when the year differs from today's. */
export function formatShortDate(key: DateKey, today: DateKey): string {
  const [y, m, d] = parts(key);
  return key.slice(0, 4) === today.slice(0, 4) ? `${pad(d)}/${pad(m)}` : `${pad(d)}/${pad(m)}/${y}`;
}

/** "29/09/2026 09:05" in local time. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const isoToDateKey = (iso: string): DateKey => toDateKey(new Date(iso));
