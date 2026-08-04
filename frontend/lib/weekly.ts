import type { WeekStats } from '@/types/api';

export interface ChartPoint {
  weekday: string;
  pomodoros: number;
  best: boolean;
}

export function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 0;
}

export function toChartSeries(stats: WeekStats): ChartPoint[] {
  return stats.days.map((d) => ({
    weekday: d.weekday,
    pomodoros: d.pomodoros,
    best: stats.bestDay != null && d.date === stats.bestDay.date,
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
