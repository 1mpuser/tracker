import { isDoneOn, routineRatioColor, unclosedRoutines, weekDays } from './routines';
import type { RoutineView } from '@/types/api';

function routine(over: Partial<RoutineView>): RoutineView {
  return {
    id: over.id ?? 1, title: over.title ?? 'Позаниматься в качалке',
    weeklyGoal: over.weeklyGoal ?? 3, categoryId: over.categoryId ?? null,
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

describe('isDoneOn', () => {
  it('видит отмеченный день', () => {
    expect(isDoneOn(routine({ days: ['2026-08-10', '2026-08-12'] }), '2026-08-12')).toBe(true);
  });

  it('не видит неотмеченный', () => {
    expect(isDoneOn(routine({ days: ['2026-08-10'] }), '2026-08-12')).toBe(false);
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

describe('unclosedRoutines', () => {
  it('считает рутины, не добравшие норму', () => {
    const list = [
      routine({ id: 1, done: 1, weeklyGoal: 3 }),
      routine({ id: 2, done: 3, weeklyGoal: 3 }),
      routine({ id: 3, done: 0, weeklyGoal: 2 }),
    ];
    expect(unclosedRoutines(list)).toBe(2);
  });

  it('перевыполненная не считается недобравшей', () => {
    expect(unclosedRoutines([routine({ done: 7, weeklyGoal: 3 })])).toBe(0);
  });

  it('пустой список даёт ноль', () => {
    expect(unclosedRoutines([])).toBe(0);
  });
});
