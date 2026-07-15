import type { HistoryEntry } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

export interface TodayCompletion {
  date: string;
  completed: number;
  total: number;
}

export function computeStreak(history: HistoryEntry[], today: TodayCompletion): number {
  const map = new Map(history.map((h) => [h.date, h]));
  map.set(today.date, { date: today.date, completed: today.completed, total: today.total, ytOver: false });

  let streak = 0;
  let cursor = addDaysUTC(parseUTC(today.date), -1);
  while (true) {
    const rec = map.get(formatUTC(cursor));
    if (rec && rec.total > 0 && rec.completed === rec.total) {
      streak++;
      cursor = addDaysUTC(cursor, -1);
    } else {
      break;
    }
  }

  if (today.total > 0 && today.completed === today.total) {
    streak++;
  }

  return streak;
}
