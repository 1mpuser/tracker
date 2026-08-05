import type { HistoryEntry } from '@/types/api';
import { streakByThreshold } from './streak';

// Это число продублировано в backend/src/telegram/weekly.helpers.ts, откуда
// строится текст недельной сводки в Telegram. Общего модуля быть не может —
// фронт и бэкенд собираются раздельными Docker-образами. Разъедутся —
// картинка (раскраска столбиков графика) и текст сводки начнут
// противоречить друг другу.
export const POMODORO_MIN = 4;
export const POMODORO_OPT = 8;

export interface TodayPomodoros {
  date: string;
  pomodoros: number;
}

export function computePomodoroStreak(history: HistoryEntry[], today: TodayPomodoros, threshold: number): number {
  return streakByThreshold(history, today.date, today.pomodoros, (h) => h.pomodoros, threshold);
}
