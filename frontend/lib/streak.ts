import type { HistoryEntry } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

export interface TodayCompletion {
  date: string;
  completed: number;
  total: number;
}

export function computeStreak(history: HistoryEntry[], today: TodayCompletion): number {
  // Deliberately excludes today.date: the backward loop below starts at yesterday
  // and never revisits it, and the final check below reads `today` directly — so
  // today's completion always comes from the live `today` param, never from a
  // (possibly stale) matching entry inside `history`.
  const map = new Map(history.filter((h) => h.date !== today.date).map((h) => [h.date, h]));

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
