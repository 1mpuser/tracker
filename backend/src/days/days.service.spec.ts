import { DaysService } from './days.service';

describe('DaysService.getDay', () => {
  let service: DaysService;
  let prisma: any;
  let categoriesService: any;
  let gtdService: any;

  beforeEach(() => {
    prisma = { day: { findUnique: jest.fn(), create: jest.fn() } };
    categoriesService = { findActive: jest.fn().mockResolvedValue([]) };
    gtdService = { getForDate: jest.fn().mockResolvedValue([]) };
    service = new DaysService(prisma, categoriesService, gtdService);
  });

  it('exposes the pomodoro count from the day row', async () => {
    prisma.day.findUnique.mockResolvedValue({
      date: new Date('2026-07-15T00:00:00.000Z'),
      youtubeMinutes: 0,
      pomodoros: 2,
      eveningClosed: false,
      rating: null,
      comment: null,
      categories: [],
    });

    const result = await service.getDay('2026-07-15');

    expect(result.pomodoros).toBe(2);
  });

  it('returns today\'s gtd slice from getForDate', async () => {
    prisma.day.findUnique.mockResolvedValue({
      date: new Date('2026-07-15T00:00:00.000Z'),
      youtubeMinutes: 0, pomodoros: 0, eveningClosed: false, rating: null, comment: null,
      categories: [],
    });
    gtdService.getForDate.mockResolvedValue([{ id: 9, title: 'Из бэклога', status: 'backlog', plannedDate: '2026-07-15' }]);

    const result = await service.getDay('2026-07-15');

    expect(gtdService.getForDate).toHaveBeenCalledWith('2026-07-15');
    expect(result.today).toEqual([{ id: 9, title: 'Из бэклога', status: 'backlog', plannedDate: '2026-07-15' }]);
    expect((result as any).dailies).toBeUndefined();
  });
});

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
    service = new DaysService(prisma, {} as any, {} as any);
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

  it('exposes the day row\'s rating', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([{ date: today, youtubeMinutes: 0, rating: 7, categories: [] }]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.rating).toBe(7);
  });

  it('defaults rating to null when there is no history record for the day', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.rating).toBeNull();
  });

  it('anchors the range on the real clock when no end date is given', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.date).toBe('2026-07-15');
  });

  it('anchors the range on the given end date instead of the real clock', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1, '2026-07-20');

    expect(entry.date).toBe('2026-07-20');
  });

  it('exposes the day row\'s pomodoro count, defaulting to 0', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([{ date: today, youtubeMinutes: 0, pomodoros: 6, categories: [] }]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.pomodoros).toBe(6);
  });
});

describe('DaysService.updateDay', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new DaysService(prisma, {} as any, {} as any);
  });

  it('forwards only the provided fields to the Prisma update, not a merged full-day object', async () => {
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);

    await service.updateDay('2026-07-14', { rating: 8 });

    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { rating: 8 } });
  });

  it('supports updating multiple fields in one call', async () => {
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);

    await service.updateDay('2026-07-14', { eveningClosed: true, comment: 'Хороший день' });

    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { eveningClosed: true, comment: 'Хороший день' },
    });
  });
});

describe('DaysService.updatePomodoros', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 5 }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 5, pomodoros: 3 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new DaysService(prisma, {} as any, {} as any);
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);
  });

  it('increments the count by the given delta', async () => {
    await service.updatePomodoros('2026-07-18', 1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 4 } });
  });

  it('clamps the count at zero on a negative delta', async () => {
    prisma.day.findUniqueOrThrow.mockResolvedValue({ id: 5, pomodoros: 0 });
    await service.updatePomodoros('2026-07-18', -1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 0 } });
  });

  it('resets the count to zero when reset is true', async () => {
    await service.updatePomodoros('2026-07-18', undefined, true);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 0 } });
  });
});
