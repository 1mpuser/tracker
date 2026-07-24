import { getMonthGrid, RU_MONTHS, RU_WEEKDAYS_SHORT } from './calendar';

describe('getMonthGrid', () => {
  it('returns exactly 42 cells (6 weeks)', () => {
    const grid = getMonthGrid(2026, 6); // July 2026 (0-indexed month)
    expect(grid).toHaveLength(42);
  });

  it('starts on a Monday (Russian week convention)', () => {
    const grid = getMonthGrid(2026, 6);
    const firstDate = new Date(`${grid[0].date}T00:00:00.000Z`);
    expect(firstDate.getUTCDay()).toBe(1); // 1 = Monday
  });

  it('ends on a Sunday', () => {
    const grid = getMonthGrid(2026, 6);
    const lastDate = new Date(`${grid[41].date}T00:00:00.000Z`);
    expect(lastDate.getUTCDay()).toBe(0); // 0 = Sunday
  });

  it('marks every day of the target month as inMonth, with correct count', () => {
    const grid = getMonthGrid(2026, 6); // July has 31 days
    const inMonthDays = grid.filter((c) => c.inMonth);
    expect(inMonthDays).toHaveLength(31);
    expect(inMonthDays[0].date).toBe('2026-07-01');
    expect(inMonthDays[30].date).toBe('2026-07-31');
  });

  it('marks leading/trailing days from adjacent months as not inMonth', () => {
    const grid = getMonthGrid(2026, 6);
    expect(grid[0].inMonth).toBe(false); // June 2026 spillover
    expect(grid[41].inMonth).toBe(false); // August 2026 spillover
  });

  it('produces a contiguous run of dates with no gaps', () => {
    const grid = getMonthGrid(2026, 6);
    for (let i = 1; i < grid.length; i++) {
      const prev = new Date(`${grid[i - 1].date}T00:00:00.000Z`);
      const cur = new Date(`${grid[i].date}T00:00:00.000Z`);
      expect(cur.getTime() - prev.getTime()).toBe(86_400_000);
    }
  });

  it('handles a month that already starts on Monday (no leading spillover)', () => {
    // June 2026 starts on Monday, June 1 2026 is a Monday.
    const grid = getMonthGrid(2026, 5);
    expect(grid[0].date).toBe('2026-06-01');
    expect(grid[0].inMonth).toBe(true);
  });
});

describe('RU_MONTHS / RU_WEEKDAYS_SHORT', () => {
  it('has 12 Russian month names, nominative case, starting with Январь', () => {
    expect(RU_MONTHS).toHaveLength(12);
    expect(RU_MONTHS[0]).toBe('Январь');
    expect(RU_MONTHS[6]).toBe('Июль');
  });

  it('has 7 short Russian weekday labels, Monday-first', () => {
    expect(RU_WEEKDAYS_SHORT).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });
});
