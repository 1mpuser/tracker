import { readFileSync } from 'fs';
import { join } from 'path';
import type { WeekStats } from '../stats/stats.service';
import {
  buildWeekSummary,
  categoryIcon,
  fitsInCaption,
  formatWeekRange,
  pluralDays,
  POMODORO_MIN,
} from './weekly.helpers';

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

  it('marks anything below five as partial', () => {
    expect(categoryIcon(4)).toBe('⚠️');
    expect(categoryIcon(1)).toBe('⚠️');
  });
});

describe('pluralDays', () => {
  it('uses the singular form for one', () => {
    expect(pluralDays(1)).toBe('дню');
    expect(pluralDays(21)).toBe('дню');
  });

  it('uses the plural form for the rest', () => {
    expect(pluralDays(2)).toBe('дням');
    expect(pluralDays(5)).toBe('дням');
    expect(pluralDays(0)).toBe('дням');
  });

  it('uses the plural form for the teens, where the last digit lies', () => {
    expect(pluralDays(11)).toBe('дням');
    expect(pluralDays(14)).toBe('дням');
  });
});

describe('buildWeekSummary qualified days', () => {
  const day = (date: string, weekday: string, pomodoros: number) => ({
    date,
    weekday,
    pomodoros,
    rating: null,
    closed: true,
  });

  it('counts days at or above the pomodoro minimum', () => {
    const text = buildWeekSummary(
      makeStats({
        days: [
          day('2026-07-27', 'Пн', 4),
          day('2026-07-28', 'Вт', 9),
          day('2026-07-29', 'Ср', 3),
          day('2026-07-30', 'Чт', 0),
          day('2026-07-31', 'Пт', 0),
          day('2026-08-01', 'Сб', 0),
          day('2026-08-02', 'Вс', 0),
        ],
      }),
    );

    expect(text).toContain('✅ В зачёте: 2 из 7 дней');
  });

  it('still reports a week with nothing qualified', () => {
    const text = buildWeekSummary(makeStats({ days: [day('2026-07-27', 'Пн', 3)] }));

    expect(text).toContain('✅ В зачёте: 0 из 7 дней');
  });
});

describe('buildWeekSummary spheres', () => {
  it('lists only the spheres with something done', () => {
    const text = buildWeekSummary(
      makeStats({
        categories: [
          { label: 'Спорт', doneCount: 0 },
          { label: 'Финансы', doneCount: 1 },
          { label: 'Обучение', doneCount: 6 },
        ],
      }),
    );

    expect(text).toContain('⚠️ Финансы 1/7');
    expect(text).toContain('✅ Обучение 6/7');
    expect(text).not.toContain('Спорт 0/7');
  });

  it('collapses untouched spheres into one quiet line', () => {
    const text = buildWeekSummary(
      makeStats({
        categories: [
          { label: 'Спорт', doneCount: 0 },
          { label: 'Финансы', doneCount: 1 },
          { label: 'Проекты', doneCount: 0 },
        ],
      }),
    );

    expect(text).toContain('Не тронуты: Спорт, Проекты');
    expect(text).not.toContain('❌');
  });

  it('omits the untouched line when every sphere was touched', () => {
    const text = buildWeekSummary(
      makeStats({ categories: [{ label: 'Спорт', doneCount: 2 }] }),
    );

    expect(text).not.toContain('Не тронуты');
  });

  it('keeps only the untouched line when nothing was touched', () => {
    const text = buildWeekSummary(
      makeStats({
        categories: [
          { label: 'Спорт', doneCount: 0 },
          { label: 'Финансы', doneCount: 0 },
        ],
      }),
    );

    expect(text).toContain('Сферы за неделю');
    expect(text).toContain('Не тронуты: Спорт, Финансы');
    // toContain('0/7') прошло бы и если сфера отрендерилась как
    // "⚠️ Спорт 0/7" — здесь важно доказать, что строки со счётчиком сферы
    // нет вообще, а не просто что в тексте нет конкретной подстроки.
    // Строка сферы со счётчиком имеет вид "✅ Название N/7" — в отличие от
    // "✅ В зачёте: N из 7 дней", она заканчивается на "N/7".
    const sphereCountLines = text.split('\n').filter((line) => /^[✅⚠️].*\d+\/7$/.test(line));
    expect(sphereCountLines).toEqual([]);
  });

  it('escapes html in the untouched line too', () => {
    const text = buildWeekSummary(
      makeStats({ categories: [{ label: 'Спорт <b>', doneCount: 0 }] }),
    );

    expect(text).toContain('Спорт &lt;b&gt;');
    expect(text).not.toContain('<b>');
  });
});

describe('buildWeekSummary rating line', () => {
  it('declines the day count correctly', () => {
    expect(buildWeekSummary(makeStats({ avgRating: 3, ratedDays: 1 }))).toContain('(по 1 дню)');
    expect(buildWeekSummary(makeStats({ avgRating: 3, ratedDays: 6 }))).toContain('(по 6 дням)');
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

  it('keeps "В зачёте" strictly between the pomodoro line and the best-day line', () => {
    // toContain по отдельности пропустит перестановку строк — здесь важен
    // именно порядок: «В зачёте» объясняет раскраску графика и должна
    // читаться сразу после итога по помидоркам, до «Лучшего дня».
    const text = buildWeekSummary(makeStats());
    const lines = text.split('\n');

    const pomodoroIndex = lines.findIndex((l) => l.startsWith('🍅 Помидорок'));
    const qualifiedIndex = lines.findIndex((l) => l.startsWith('✅ В зачёте'));
    const bestDayIndex = lines.findIndex((l) => l.startsWith('🔥 Лучший день'));

    expect(pomodoroIndex).toBeGreaterThanOrEqual(0);
    expect(qualifiedIndex).toBeGreaterThan(pomodoroIndex);
    expect(bestDayIndex).toBeGreaterThan(qualifiedIndex);
  });
});

describe('POMODORO_MIN stays in sync with the frontend copy', () => {
  it('matches the value in frontend/lib/pomodoro.ts', () => {
    // Порог продублирован (см. комментарии в обоих файлах), потому что
    // фронт и бэкенд собираются раздельными Docker-образами и общего
    // модуля быть не может. Этот тест — единственная страховка от
    // расхождения; молча пройти он не должен ни при отсутствии файла,
    // ни при несматчившейся регулярке.
    const frontendPath = join(__dirname, '../../../frontend/lib/pomodoro.ts');
    let source: string;
    try {
      source = readFileSync(frontendPath, 'utf8');
    } catch (e) {
      throw new Error(
        `Не удалось прочитать ${frontendPath}, чтобы сверить POMODORO_MIN с бэкендом: ${String(e)}`,
      );
    }

    const match = source.match(/export const POMODORO_MIN = (\d+);/);
    if (!match) {
      throw new Error(
        `Не нашёл "export const POMODORO_MIN = <число>;" в ${frontendPath} — ` +
          'копии POMODORO_MIN больше не удаётся сверить автоматически. ' +
          'Проверь константу руками и поправь регулярку в этом тесте.',
      );
    }

    expect(Number(match[1])).toBe(POMODORO_MIN);
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
