import type { WeekStats } from '@/types/api';
import { formatWeekRangeShort, isSunday, toChartSeries } from './weekly';

function makeStats(overrides: Partial<WeekStats> = {}): WeekStats {
  return {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [
      { date: '2026-07-27', weekday: 'Пн', pomodoros: 4, rating: null, closed: true },
      { date: '2026-07-28', weekday: 'Вт', pomodoros: 0, rating: null, closed: false },
      { date: '2026-07-29', weekday: 'Ср', pomodoros: 8, rating: null, closed: true },
      { date: '2026-07-30', weekday: 'Чт', pomodoros: 2, rating: null, closed: true },
      { date: '2026-07-31', weekday: 'Пт', pomodoros: 5, rating: null, closed: true },
      { date: '2026-08-01', weekday: 'Сб', pomodoros: 1, rating: null, closed: true },
      { date: '2026-08-02', weekday: 'Вс', pomodoros: 3, rating: null, closed: true },
    ],
    totalPomodoros: 23,
    avgPomodoros: 3.3,
    bestDay: { date: '2026-07-29', weekday: 'Ср', pomodoros: 8 },
    avgRating: null,
    ratedDays: 0,
    categories: [],
    youtubeAvgMinutes: 0,
    youtubeBudget: 60,
    ...overrides,
  };
}

describe('isSunday', () => {
  it('recognises a sunday', () => {
    expect(isSunday('2026-08-02')).toBe(true);
  });

  it('rejects a monday and a saturday', () => {
    expect(isSunday('2026-08-03')).toBe(false);
    expect(isSunday('2026-08-01')).toBe(false);
  });
});

describe('toChartSeries', () => {
  it('keeps monday-to-sunday order', () => {
    expect(toChartSeries(makeStats()).map((p) => p.weekday)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });

  it('marks days at or above the pomodoro minimum as qualified', () => {
    const series = toChartSeries(makeStats());

    expect(series.filter((p) => p.qualified).map((p) => p.weekday)).toEqual(['Пн', 'Ср', 'Пт']);
  });

  it('marks nothing when no day reached the minimum', () => {
    const stats = makeStats();
    const series = toChartSeries({ ...stats, days: stats.days.map((d) => ({ ...d, pomodoros: 1 })) });

    expect(series.some((p) => p.qualified)).toBe(false);
  });

  it('passes zero days through as zeros', () => {
    expect(toChartSeries(makeStats())[1]).toEqual({ weekday: 'Вт', pomodoros: 0, qualified: false });
  });
});

describe('formatWeekRangeShort', () => {
  it('renders both ends without a year', () => {
    expect(formatWeekRangeShort('2026-07-27', '2026-08-02')).toBe('27 июля — 2 августа');
  });
});
