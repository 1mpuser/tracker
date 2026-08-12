import { addDays, formatDate, mondayOf, parseDateParam } from './date.util';

describe('date.util', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    const d = parseDateParam('2026-07-15');
    expect(d.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('rejects malformed date strings', () => {
    expect(() => parseDateParam('15-07-2026')).toThrow();
  });

  it('rejects calendar-invalid dates instead of silently rolling over', () => {
    expect(() => parseDateParam('2026-02-30')).toThrow();
    expect(() => parseDateParam('2026-04-31')).toThrow();
  });

  it('formats a UTC date back to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-07-15T00:00:00.000Z'))).toBe('2026-07-15');
  });

  it('adds days across a month boundary without drifting', () => {
    const d = addDays(new Date('2026-07-31T00:00:00.000Z'), 1);
    expect(formatDate(d)).toBe('2026-08-01');
  });

  it('возвращает сам понедельник без сдвига', () => {
    const d = mondayOf(new Date('2026-08-10T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-10');
  });

  it('для воскресенья возвращает понедельник той же недели, а не следующей', () => {
    const d = mondayOf(new Date('2026-08-16T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-10');
  });

  it('для середины недели возвращает начало этой недели', () => {
    const d = mondayOf(new Date('2026-08-12T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-10');
  });

  it('корректно переходит через границу месяца', () => {
    const d = mondayOf(new Date('2026-09-02T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-31');
  });
});
