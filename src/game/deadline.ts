import type { DateKey, Quest } from '../types';
import { daysBetween } from './dates';

export interface DeadlineInfo { text: string; overdue: boolean; dueToday: boolean; }

export function deadlineInfo(deadline: DateKey, today: DateKey): DeadlineInfo {
  const diff = daysBetween(today, deadline);
  if (diff === 0) return { text: 'today!', overdue: false, dueToday: true };
  if (diff === 1) return { text: 'tomorrow', overdue: false, dueToday: false };
  if (diff > 1) return { text: `${diff} days`, overdue: false, dueToday: false };
  const late = -diff;
  return { text: late === 1 ? '1 day late' : `${late} days late`, overdue: true, dueToday: false };
}

export function isOverdue(quest: Pick<Quest, 'deadline' | 'completion'>, today: DateKey): boolean {
  return quest.completion === null && quest.deadline !== null && quest.deadline < today;
}
