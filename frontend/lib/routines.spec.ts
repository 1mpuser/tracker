import { dayCount, isDayFull, nextCount, routineRatioColor, weekDays } from './routines';
import type { RoutineView } from '@/types/api';

function routine(over: Partial<RoutineView>): RoutineView {
  return {
    id: over.id ?? 1, title: over.title ?? 'Гигиена',
    timesPerDay: over.timesPerDay ?? 1, daysPerWeek: over.daysPerWeek ?? 3,
    categoryId: over.categoryId ?? null,
    done: over.done ?? 0, days: over.days ?? [], order: over.order ?? 0,
  };
}

describe('weekDays', () => {
  it('отдаёт семь дат от понедельника до воскресенья', () => {
    expect(weekDays('2026-08-10')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
      '2026-08-14', '2026-08-15', '2026-08-16',
    ]);
  });

  it('корректно переходит через границу месяца', () => {
    expect(weekDays('2026-08-31')[6]).toBe('2026-09-06');
  });
});

describe('dayCount', () => {
  it('возвращает число отметок за день', () => {
    const r = routine({ days: [{ date: '2026-08-10', count: 2 }] });
    expect(dayCount(r, '2026-08-10')).toBe(2);
  });

  it('день без отметок — ноль', () => {
    expect(dayCount(routine({ days: [] }), '2026-08-10')).toBe(0);
  });
});

describe('isDayFull', () => {
  it('день закрыт, когда набрана дневная норма', () => {
    const r = routine({ timesPerDay: 2, days: [{ date: '2026-08-10', count: 2 }] });
    expect(isDayFull(r, '2026-08-10')).toBe(true);
  });

  it('половина нормы — не закрыт', () => {
    const r = routine({ timesPerDay: 2, days: [{ date: '2026-08-10', count: 1 }] });
    expect(isDayFull(r, '2026-08-10')).toBe(false);
  });

  it('при норме 1 одна отметка закрывает день', () => {
    const r = routine({ timesPerDay: 1, days: [{ date: '2026-08-10', count: 1 }] });
    expect(isDayFull(r, '2026-08-10')).toBe(true);
  });
});

describe('nextCount', () => {
  it('при норме 1 работает как переключатель', () => {
    expect(nextCount(0, 1)).toBe(1);
    expect(nextCount(1, 1)).toBe(0);
  });

  it('при норме 2 цикл 0 → 1 → 2 → 0', () => {
    expect(nextCount(0, 2)).toBe(1);
    expect(nextCount(1, 2)).toBe(2);
    expect(nextCount(2, 2)).toBe(0);
  });

  it('значение выше нормы сбрасывается в ноль', () => {
    expect(nextCount(5, 2)).toBe(0);
  });
});

describe('routineRatioColor', () => {
  it('ноль выполнений — нейтральный фон', () => {
    expect(routineRatioColor(0, 3)).toBe('var(--panel-alt)');
  });

  it('норма выполнена — полный акцент', () => {
    expect(routineRatioColor(3, 3)).toBe('var(--accent)');
  });

  it('перевыполнение — тот же полный акцент, не ошибка', () => {
    expect(routineRatioColor(7, 3)).toBe('var(--accent)');
  });

  it('частичное выполнение бледнее полного', () => {
    expect(routineRatioColor(1, 3)).not.toBe('var(--accent)');
    expect(routineRatioColor(1, 3)).not.toBe('var(--panel-alt)');
  });

  it('норма 0 не роняет расчёт делением на ноль', () => {
    expect(routineRatioColor(0, 0)).toBe('var(--panel-alt)');
  });
});
