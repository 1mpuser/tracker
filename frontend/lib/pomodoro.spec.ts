import { POMODORO_MIN, POMODORO_OPT, computePomodoroStreak } from './pomodoro';
import type { HistoryEntry } from '@/types/api';

function entry(date: string, pomodoros: number): HistoryEntry {
  return { date, completed: 0, total: 6, pomodoros, ytOver: false, rating: null };
}

describe('pomodoro thresholds', () => {
  it('exports 4 and 8', () => {
    expect(POMODORO_MIN).toBe(4);
    expect(POMODORO_OPT).toBe(8);
  });
});

describe('computePomodoroStreak', () => {
  it('counts consecutive days at or above the threshold, ending yesterday', () => {
    const history = [entry('2026-07-15', 4), entry('2026-07-16', 5), entry('2026-07-17', 8)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 0 }, 4)).toBe(3);
  });

  it('adds today only when today meets the threshold', () => {
    // Вчера (17) ниже порога 8 → backward-loop сразу обрывается, в серию идёт
    // только сегодня. День-позавчера (16) с 8 недостижим из-за обрыва.
    const history = [entry('2026-07-16', 8), entry('2026-07-17', 3)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 8 }, 8)).toBe(1);
  });

  it('breaks at the first day below the threshold looking backward', () => {
    const history = [entry('2026-07-15', 8), entry('2026-07-16', 3), entry('2026-07-17', 8)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 8 }, 8)).toBe(2);
  });

  it('treats a day with no history record as broken', () => {
    const history = [entry('2026-07-17', 4)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 4 }, 4)).toBe(2);
  });

  it('uses the live today value over a stale same-date history record', () => {
    const history = [entry('2026-07-16', 4), entry('2026-07-17', 4), entry('2026-07-18', 0)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 4 }, 4)).toBe(3);
  });
});
