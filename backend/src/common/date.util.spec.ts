import { addDays, formatDate, parseDateParam } from './date.util';

describe('date.util', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    const d = parseDateParam('2026-07-15');
    expect(d.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('rejects malformed date strings', () => {
    expect(() => parseDateParam('15-07-2026')).toThrow();
  });

  it('formats a UTC date back to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-07-15T00:00:00.000Z'))).toBe('2026-07-15');
  });

  it('adds days across a month boundary without drifting', () => {
    const d = addDays(new Date('2026-07-31T00:00:00.000Z'), 1);
    expect(formatDate(d)).toBe('2026-08-01');
  });
});
