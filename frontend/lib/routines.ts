import type { RoutineView } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

/** Семь дат недели пн–вс, начиная с weekStart. */
export function weekDays(weekStart: string): string[] {
  const start = parseUTC(weekStart);
  return Array.from({ length: 7 }, (_, i) => formatUTC(addDaysUTC(start, i)));
}

export function isDoneOn(routine: RoutineView, date: string): boolean {
  return routine.days.includes(date);
}

/** Цвет по доле выполнения нормы. Перевыполнение — не ошибка, красим как выполненную. */
export function routineRatioColor(done: number, goal: number): string {
  if (done <= 0 || goal <= 0) return 'var(--panel-alt)';
  const ratio = done / goal;
  if (ratio >= 1) return 'var(--accent)';
  if (ratio >= 0.66) return 'rgba(224, 164, 88, 0.55)';
  if (ratio >= 0.33) return 'rgba(224, 164, 88, 0.3)';
  return 'var(--accent-soft)';
}
