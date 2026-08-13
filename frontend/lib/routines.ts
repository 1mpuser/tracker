import type { RoutineView } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

/** Семь дат недели пн–вс, начиная с weekStart. */
export function weekDays(weekStart: string): string[] {
  const start = parseUTC(weekStart);
  return Array.from({ length: 7 }, (_, i) => formatUTC(addDaysUTC(start, i)));
}

export function dayCount(routine: RoutineView, date: string): number {
  return routine.days.find((d) => d.date === date)?.count ?? 0;
}

export function isDayFull(routine: RoutineView, date: string): boolean {
  return dayCount(routine, date) >= routine.timesPerDay;
}

/** Клик по дню: 0 → 1 → … → дневная норма → 0. При норме 1 — обычное переключение. */
export function nextCount(current: number, timesPerDay: number): number {
  return current >= timesPerDay ? 0 : current + 1;
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
