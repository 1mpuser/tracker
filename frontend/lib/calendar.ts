import { addDaysUTC, formatUTC } from './date';

export interface CalendarCell {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

export const RU_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const RU_WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Monday-first 6x7 grid covering `month` (0-indexed) of `year`, including
// leading/trailing days from adjacent months so every week row is full.
export function getMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  // JS getUTCDay(): 0=Sunday..6=Saturday. Convert to Monday-first offset (0=Mon..6=Sun).
  const mondayFirstDow = (firstOfMonth.getUTCDay() + 6) % 7;
  const start = addDaysUTC(firstOfMonth, -mondayFirstDow);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDaysUTC(start, i);
    cells.push({
      date: formatUTC(d),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month && d.getUTCFullYear() === year,
    });
  }
  return cells;
}
