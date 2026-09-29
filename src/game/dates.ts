import type { DateKey } from '../types';

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toUtcMs(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = new Date(toUtcMs(key) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
