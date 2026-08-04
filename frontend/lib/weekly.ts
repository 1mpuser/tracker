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
