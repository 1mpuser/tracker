import { isEveningWindow, isMorningWindow, isWeeklyReviewWindow } from './notifications';

describe('isMorningWindow', () => {
  it('is true at exactly 09:00', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 9, 0))).toBe(true);
  });
  it('is true just before 21:30', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 21, 29))).toBe(true);
  });
  it('is false at 21:30', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 21, 30))).toBe(false);
  });
  it('is false before 09:00', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 8, 59))).toBe(false);
  });
});

describe('isEveningWindow', () => {
  it('is true at exactly 21:30', () => {
    expect(isEveningWindow(new Date(2026, 6, 15, 21, 30))).toBe(true);
  });
  it('is true just before midnight', () => {
    expect(isEveningWindow(new Date(2026, 6, 15, 23, 59))).toBe(true);
  });
  it('is false before 21:30', () => {
    expect(isEveningWindow(new Date(2026, 6, 15, 21, 29))).toBe(false);
  });
});

describe('isWeeklyReviewWindow', () => {
  // Даты — локальные: new Date(year, monthIndex, day, hour, min). 2026-07-26 — воскресенье.
  it('is false on Sunday before 11:00', () => {
    expect(isWeeklyReviewWindow(new Date(2026, 6, 26, 10, 59))).toBe(false);
  });
  it('is true on Sunday at 11:00', () => {
    expect(isWeeklyReviewWindow(new Date(2026, 6, 26, 11, 0))).toBe(true);
  });
  it('is true on Sunday in the evening', () => {
    expect(isWeeklyReviewWindow(new Date(2026, 6, 26, 18, 0))).toBe(true);
  });
  it('is false on a weekday', () => {
    // 2026-07-27 — понедельник
    expect(isWeeklyReviewWindow(new Date(2026, 6, 27, 12, 0))).toBe(false);
  });
});
