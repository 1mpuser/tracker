import { StatsService } from './stats.service';

describe('StatsService.youtubeDailyStats', () => {
  beforeEach(() => {
    // Fixed system time so "today" inside the service is deterministic.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes pct as minutes-over-budget, defaulting missing days to 0', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    const prisma: any = {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 50 }) },
      day: { findMany: jest.fn().mockResolvedValue([{ date: today, youtubeMinutes: 25 }]) },
    };
    const service = new StatsService(prisma);

    const result = await service.youtubeDailyStats(2);

    expect(result).toHaveLength(2);
    expect(result[1].minutes).toBe(25);
    expect(result[1].pct).toBe(50);
    expect(result[0].minutes).toBe(0);
    expect(result[0].pct).toBe(0);
  });
});

describe('StatsService.youtubeWeeklyStats', () => {
  beforeEach(() => {
    // Fixed system time (a Wednesday) so Monday-alignment is deterministic and assertable.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('averages minutes across all 7 days of each week, treating gaps as 0, aligned to Monday', async () => {
    const prisma: any = {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 60 }) },
      day: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StatsService(prisma);

    const result = await service.youtubeWeeklyStats(1);

    expect(result).toHaveLength(1);
    expect(result[0].weekStart).toBe('2026-07-13'); // Monday of the week containing 2026-07-15
    expect(result[0].avgMinutes).toBe(0);
    expect(result[0].budget).toBe(60);
  });

  it('aligns to Monday even when "today" is itself a Sunday', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T12:00:00.000Z')); // Sunday
    const prisma: any = {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 60 }) },
      day: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new StatsService(prisma);

    const result = await service.youtubeWeeklyStats(1);

    expect(result[0].weekStart).toBe('2026-07-13'); // Monday of the *same* week, not the next one
  });
});

describe('StatsService.categoryStats', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes pct as doneCount / days, per non-archived category', async () => {
    const prisma: any = {
      category: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, key: 'sport', label: 'Спорт', order: 0 }]),
      },
      dayCategoryStatus: {
        findMany: jest.fn().mockResolvedValue([
          { categoryId: 1, done: true },
          { categoryId: 1, done: true },
          { categoryId: 1, done: false },
        ]),
      },
    };
    const service = new StatsService(prisma);

    const [entry] = await service.categoryStats(10);

    expect(entry).toEqual({ key: 'sport', label: 'Спорт', doneCount: 2, totalDays: 10, pct: 20 });
  });
});
