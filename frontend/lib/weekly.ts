import type { WeekStats } from '@/types/api';
import { POMODORO_MIN } from '@/lib/pomodoro';

export interface ChartPoint {
  weekday: string;
  pomodoros: number;
  qualified: boolean;
}

export function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 0;
}

export function toChartSeries(stats: WeekStats): ChartPoint[] {
  return stats.days.map((d) => ({
    weekday: d.weekday,
    pomodoros: d.pomodoros,
    qualified: d.pomodoros >= POMODORO_MIN,
  }));
}

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function dayAndMonth(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

export function formatWeekRangeShort(weekStart: string, weekEnd: string): string {
  return `${dayAndMonth(weekStart)} — ${dayAndMonth(weekEnd)}`;
}
