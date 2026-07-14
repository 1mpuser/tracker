import { DaysService } from './days.service';

describe('DaysService.getHistory', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    // Fixed system time so "today" in the service under test is deterministic —
    // getHistory() computes its date range from the real clock internally.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    prisma = {
      day: { findMany: jest.fn() },
      category: { findMany: jest.fn() },
      settings: { findUnique: jest.fn() },
    };
    service = new DaysService(prisma, {} as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('treats a day with no record as 0 completed out of all active categories (not 0/0)', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 2, key: 'family', archived: false },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.completed).toBe(0);
    expect(entry.total).toBe(2);
  });

  it('still counts an archived category toward total on a day it has a tracked status', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([
      {
        date: today,
        youtubeMinutes: 10,
        categories: [{ categoryId: 3, done: true }],
      },
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 3, key: 'old', archived: true },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.total).toBe(2);
    expect(entry.completed).toBe(1);
  });

  it('excludes an archived category from days where it was never tracked', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 3, key: 'old', archived: true },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.total).toBe(1);
  });

  it('flags ytOver when minutes exceed the current budget', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([
      { date: today, youtubeMinutes: 90, categories: [] },
    ]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.ytOver).toBe(true);
  });
});
