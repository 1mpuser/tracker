import { computeStreak } from './streak';
import type { HistoryEntry } from '@/types/api';

function entry(date: string, completed: number, total: number): HistoryEntry {
  return { date, completed, total, ytOver: false };
}

describe('computeStreak', () => {
  it('counts consecutive fully-complete days ending yesterday when today is not yet complete', () => {
    const history = [entry('2026-07-12', 5, 5), entry('2026-07-13', 5, 5), entry('2026-07-14', 5, 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2, total: 5 })).toBe(3);
  });

  it('adds today to the streak only when today is itself fully complete', () => {
    const history = [entry('2026-07-13', 5, 5), entry('2026-07-14', 5, 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(3);
  });

  it('breaks the streak at the first incomplete day looking backward', () => {
    const history = [
      entry('2026-07-11', 5, 5),
      entry('2026-07-12', 3, 5),
      entry('2026-07-13', 5, 5),
      entry('2026-07-14', 5, 5),
    ];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(3);
  });

  it('treats a day with no history record as broken, not complete', () => {
    const history = [entry('2026-07-14', 5, 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(2);
  });

  it('does not count a degenerate 0-total day (all categories archived) as complete', () => {
    const history = [entry('2026-07-14', 0, 0)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 0, total: 0 })).toBe(0);
  });
});
