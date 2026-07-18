import type { HistoryEntry } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

export const STREAK_THRESHOLD = 2;

export interface TodayCompletion {
  date: string;
  completed: number;
}

// Общий backward-loop для серий по порогу. Сегодняшняя запись из history
// исключается: цикл идёт с вчера и никогда не заходит на today.date, а
// сегодняшнее значение берётся из todayValue (свежий live-параметр), не из
// возможно устаревшей записи history за ту же дату.
export function streakByThreshold<T extends { date: string }>(
  history: T[],
  todayDate: string,
  todayValue: number,
  getValue: (entry: T) => number,
  threshold: number,
): number {
  const map = new Map(history.filter((h) => h.date !== todayDate).map((h) => [h.date, h]));

  let streak = 0;
  let cursor = addDaysUTC(parseUTC(todayDate), -1);
  while (true) {
    const rec = map.get(formatUTC(cursor));
    if (rec && getValue(rec) >= threshold) {
      streak++;
      cursor = addDaysUTC(cursor, -1);
    } else {
      break;
    }
  }

  if (todayValue >= threshold) {
    streak++;
  }

  return streak;
}

export function computeStreak(history: HistoryEntry[], today: TodayCompletion): number {
  return streakByThreshold(history, today.date, today.completed, (h) => h.completed, STREAK_THRESHOLD);
}
