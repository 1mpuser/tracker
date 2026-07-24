import { addDaysUTC, formatDisplayDate, formatOriginDate, formatRuDate, formatUTC, parseUTC, todayLocal } from './date';

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

  it('todayLocal reads the local wall-clock calendar date', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 23, 30));
    expect(todayLocal()).toBe('2026-07-15');
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

  it('formatRuDate converts YYYY-MM-DD to DD.MM.YYYY', () => {
    expect(formatRuDate('2026-07-25')).toBe('25.07.2026');
  });

  it('formatRuDate appends time when provided', () => {
    expect(formatRuDate('2026-07-25', '14:30')).toBe('25.07.2026 14:30');
  });

  it('formatRuDate ignores null time', () => {
    expect(formatRuDate('2026-07-25', null)).toBe('25.07.2026');
  });

  it('formatRuDate ignores empty string time', () => {
    expect(formatRuDate('2026-07-25', '')).toBe('25.07.2026');
  });
});
