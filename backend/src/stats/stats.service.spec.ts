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

describe('StatsService.weekStats', () => {
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  function makePrisma(overrides: any = {}) {
    return {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 60 }) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      dayCategoryStatus: { findMany: jest.fn().mockResolvedValue([]) },
      day: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  it('spans monday..sunday of the given sunday', async () => {
    const service = new StatsService(makePrisma() as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.weekStart).toBe('2026-07-27');
    expect(result.weekEnd).toBe('2026-08-02');
    expect(result.days).toHaveLength(7);
    expect(result.days[0].weekday).toBe('Пн');
    expect(result.days[6].weekday).toBe('Вс');
  });

  it('spans the containing week for a mid-week date', async () => {
    const service = new StatsService(makePrisma() as any);

    const result = await service.weekStats('2026-07-29');

    expect(result.weekStart).toBe('2026-07-27');
    expect(result.weekEnd).toBe('2026-08-02');
  });

  it('fills missing days with zeros instead of skipping them', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 29), pomodoros: 5, rating: 8, eveningClosed: true, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.days.map((d) => d.pomodoros)).toEqual([0, 0, 5, 0, 0, 0, 0]);
    expect(result.days[0].closed).toBe(false);
  });

  it('averages pomodoros over seven days, not over closed days', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 27), pomodoros: 7, rating: null, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 28), pomodoros: 7, rating: null, eveningClosed: true, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.totalPomodoros).toBe(14);
    expect(result.avgPomodoros).toBe(2);
  });

  it('averages rating over rated days only', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 27), pomodoros: 0, rating: 8, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 28), pomodoros: 0, rating: 6, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 29), pomodoros: 0, rating: null, eveningClosed: false, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.avgRating).toBe(7);
    expect(result.ratedDays).toBe(2);
  });

  it('returns null rating and null best day for an empty week', async () => {
    const service = new StatsService(makePrisma() as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.avgRating).toBeNull();
    expect(result.ratedDays).toBe(0);
    expect(result.bestDay).toBeNull();
  });

  it('picks the earliest day when the best day ties', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 28), pomodoros: 9, rating: null, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 31), pomodoros: 9, rating: null, eveningClosed: true, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.bestDay).toEqual({ date: '2026-07-28', weekday: 'Вт', pomodoros: 9 });
  });

  it('counts category completions over the week', async () => {
    const prisma = makePrisma({
      category: { findMany: jest.fn().mockResolvedValue([{ id: 1, label: 'Спорт', order: 0 }]) },
      dayCategoryStatus: {
        findMany: jest.fn().mockResolvedValue([
          { categoryId: 1, done: true },
          { categoryId: 1, done: true },
          { categoryId: 1, done: false },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.categories).toEqual([{ label: 'Спорт', doneCount: 2 }]);
  });

  it('averages youtube minutes over seven days', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 27), pomodoros: 0, rating: null, eveningClosed: false, youtubeMinutes: 70 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.youtubeAvgMinutes).toBe(10);
    expect(result.youtubeBudget).toBe(60);
  });
});
