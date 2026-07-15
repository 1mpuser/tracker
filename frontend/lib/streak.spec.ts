import { computeStreak, STREAK_THRESHOLD } from './streak';
import type { HistoryEntry } from '@/types/api';

function entry(date: string, completed: number): HistoryEntry {
  return { date, completed, total: 6, ytOver: false };
}

describe('computeStreak', () => {
  it('exports a threshold of 2', () => {
    expect(STREAK_THRESHOLD).toBe(2);
  });

  it('counts consecutive days meeting the threshold, ending yesterday, when today has not met it yet', () => {
    const history = [entry('2026-07-12', 2), entry('2026-07-13', 3), entry('2026-07-14', 2)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 1 })).toBe(3);
  });

  it('adds today to the streak only when today itself meets the threshold', () => {
    const history = [entry('2026-07-13', 2), entry('2026-07-14', 4)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(3);
  });

  it('breaks the streak at the first day below the threshold looking backward', () => {
    const history = [entry('2026-07-11', 2), entry('2026-07-12', 1), entry('2026-07-13', 2), entry('2026-07-14', 3)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(3);
  });

  it('treats a day with no history record as broken, not met', () => {
    const history = [entry('2026-07-14', 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(2);
  });

  it('does not count a day as meeting the threshold just because it was 100% complete with fewer than 2 categories', () => {
    const history = [{ date: '2026-07-14', completed: 1, total: 1, ytOver: false }];
    expect(computeStreak(history, { date: '2026-07-15', completed: 0 })).toBe(0);
  });

  it('uses the live today param over a stale history record for the same date', () => {
    // /history was fetched before the user's most recent toggle today, so it still
    // shows a below-threshold day — the caller passes the fresher live state instead.
    const history = [entry('2026-07-13', 3), entry('2026-07-14', 2), entry('2026-07-15', 1)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(3);
  });
});
