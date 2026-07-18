import type { HistoryEntry } from '@/types/api';
import { streakByThreshold } from './streak';

export const POMODORO_MIN = 4;
export const POMODORO_OPT = 8;

export interface TodayPomodoros {
  date: string;
  pomodoros: number;
}

export function computePomodoroStreak(history: HistoryEntry[], today: TodayPomodoros, threshold: number): number {
  return streakByThreshold(history, today.date, today.pomodoros, (h) => h.pomodoros, threshold);
}
