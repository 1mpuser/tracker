import type { WeekStats } from '../stats/stats.service';
import { buildWeekSummary, categoryIcon, fitsInCaption, formatWeekRange } from './weekly.helpers';

function makeStats(overrides: Partial<WeekStats> = {}): WeekStats {
  return {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [],
    totalPomodoros: 34,
    avgPomodoros: 4.9,
    bestDay: { date: '2026-07-29', weekday: 'Ср', pomodoros: 8 },
    avgRating: 7.4,
    ratedDays: 6,
    categories: [{ label: 'Спорт', doneCount: 5 }],
    youtubeAvgMinutes: 42,
    youtubeBudget: 60,
    ...overrides,
  };
}

describe('formatWeekRange', () => {
  it('renders both months when the week spans two of them', () => {
    expect(formatWeekRange('2026-07-27', '2026-08-02')).toBe('27 июля — 2 августа 2026');
  });

  it('still names both months inside a single month', () => {
    expect(formatWeekRange('2026-08-03', '2026-08-09')).toBe('3 августа — 9 августа 2026');
  });
});

describe('categoryIcon', () => {
  it('marks five or more days as done', () => {
    expect(categoryIcon(5)).toBe('✅');
    expect(categoryIcon(7)).toBe('✅');
  });

  it('marks two to four days as partial', () => {
    expect(categoryIcon(4)).toBe('⚠️');
    expect(categoryIcon(2)).toBe('⚠️');
  });

  it('marks zero or one day as failed', () => {
    expect(categoryIcon(1)).toBe('❌');
    expect(categoryIcon(0)).toBe('❌');
  });
});

describe('buildWeekSummary', () => {
  it('includes totals, best day, rating, spheres and youtube', () => {
    const text = buildWeekSummary(makeStats());

    expect(text).toContain('📊 Неделя 27 июля — 2 августа 2026');
    expect(text).toContain('🍅 Помидорок: 34 (в среднем 4.9/день)');
    expect(text).toContain('🔥 Лучший день: среда — 8');
    expect(text).toContain('⭐ Средняя оценка: 7.4/10 (по 6 дням)');
    expect(text).toContain('✅ Спорт 5/7');
    expect(text).toContain('📺 YouTube: 42 мин/день при бюджете 60');
  });

  it('omits the rating line when nothing was rated', () => {
    const text = buildWeekSummary(makeStats({ avgRating: null, ratedDays: 0 }));

    expect(text).not.toContain('Средняя оценка');
  });

  it('omits the best-day line when the week had no pomodoros', () => {
    const text = buildWeekSummary(makeStats({ bestDay: null, totalPomodoros: 0, avgPomodoros: 0 }));

    expect(text).not.toContain('Лучший день');
    expect(text).toContain('🍅 Помидорок: 0');
  });

  it('escapes html in category labels', () => {
    const text = buildWeekSummary(makeStats({ categories: [{ label: 'Спорт <b>', doneCount: 5 }] }));

    expect(text).toContain('Спорт &lt;b&gt;');
    expect(text).not.toContain('<b>');
  });

  it('omits the spheres block entirely when there are no categories', () => {
    const text = buildWeekSummary(makeStats({ categories: [] }));

    expect(text).not.toContain('Сферы за неделю');
  });
});

describe('fitsInCaption', () => {
  it('accepts a normal summary', () => {
    expect(fitsInCaption(buildWeekSummary(makeStats()))).toBe(true);
  });

  it('rejects text over the telegram caption limit', () => {
    expect(fitsInCaption('x'.repeat(1025))).toBe(false);
  });

  it('accepts text exactly at the limit', () => {
    expect(fitsInCaption('x'.repeat(1024))).toBe(true);
  });
});
