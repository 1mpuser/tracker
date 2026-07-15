import { addDaysUTC, formatDisplayDate, formatOriginDate, formatUTC, parseUTC, todayUTC } from './date';

describe('date utils', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    expect(parseUTC('2026-07-15').toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('formats a UTC date back to YYYY-MM-DD', () => {
    expect(formatUTC(new Date('2026-07-15T00:00:00.000Z'))).toBe('2026-07-15');
  });

  it('adds days across a month boundary without drifting', () => {
    expect(formatUTC(addDaysUTC(new Date('2026-07-31T00:00:00.000Z'), 1))).toBe('2026-08-01');
  });

  it('todayUTC reads the UTC calendar date, not the local one', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T22:00:00.000Z'));
    expect(todayUTC()).toBe('2026-07-15');
    jest.useRealTimers();
  });

  it('formats a Russian display date (weekday, day, month)', () => {
    expect(formatDisplayDate('2026-07-15')).toBe('среда, 15 июля');
  });

  it('formatOriginDate says "вчера" for one day before the target date', () => {
    expect(formatOriginDate('2026-07-15', '2026-07-16')).toBe('вчера');
  });

  it('formatOriginDate says "позавчера" for two days before the target date', () => {
    expect(formatOriginDate('2026-07-14', '2026-07-16')).toBe('позавчера');
  });

  it('formatOriginDate falls back to "с <day month>" for anything older', () => {
    expect(formatOriginDate('2026-07-10', '2026-07-16')).toBe('с 10 июля');
  });
});
