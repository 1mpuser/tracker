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
    service = new DaysService(prisma, categoriesService, gtdService, {} as any, {} as any);
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
    service = new DaysService(prisma, {} as any, {} as any, {} as any, {} as any);
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

describe('DaysService.updateDay telegram posting', () => {
  let service: DaysService;
  let prisma: any;
  let telegram: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    telegram = { postDaySummary: jest.fn().mockResolvedValue(555) };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      telegram,
      {} as any,
    );
  });

  // getOrCreateDayId() и getDay() внутри updateDay() тоже ходят в findUnique —
  // возвращаем одну и ту же строку дня на все вызовы.
  function dayRow(overrides: any = {}) {
    return {
      id: 1,
      date: new Date('2026-08-01T00:00:00.000Z'),
      youtubeMinutes: 0,
      pomodoros: 7,
      eveningClosed: false,
      rating: 8,
      comment: null,
      telegramMessageId: null,
      categories: [],
      ...overrides,
    };
  }

  it('posts the summary and stores the returned message id when the day is closed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());

    await service.updateDay('2026-08-01', { eveningClosed: true });

    expect(prisma.day.updateMany).toHaveBeenCalledWith({
      where: { id: 1, telegramMessageId: null },
      data: { telegramMessageId: 0 },
    });
    expect(telegram.postDaySummary).toHaveBeenCalledTimes(1);
    expect(telegram.postDaySummary.mock.calls[0][0]).toMatchObject({ date: '2026-08-01', pomodoros: 7 });
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { telegramMessageId: 555 } });
  });

  it('does not post again for a day that was already posted (updateMany claims nothing)', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow({ telegramMessageId: 555 }));
    prisma.day.updateMany.mockResolvedValue({ count: 0 });

    await service.updateDay('2026-08-01', { eveningClosed: true });

    expect(telegram.postDaySummary).not.toHaveBeenCalled();
  });

  it('does not post and does not write when a concurrent close already claimed the row', async () => {
    // Двойной клик: обе заявки видят один и тот же день, но updateMany
    // атомарно достаётся только одному конкурентному запросу.
    prisma.day.findUnique.mockResolvedValue(dayRow());
    prisma.day.updateMany.mockResolvedValue({ count: 0 });

    await service.updateDay('2026-08-01', { eveningClosed: true });

    expect(telegram.postDaySummary).not.toHaveBeenCalled();
    // Единственный update() в этом сценарии — сам апдейт дня в начале updateDay();
    // никакой записи telegramMessageId после проигранной заявки быть не должно.
    expect(prisma.day.update).toHaveBeenCalledTimes(1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { eveningClosed: true } });
  });

  it('does not store anything when the post failed, but resets the claim to null for retry', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());
    telegram.postDaySummary.mockResolvedValue(null);

    await expect(service.updateDay('2026-08-01', { eveningClosed: true })).resolves.toMatchObject({
      date: '2026-08-01',
    });

    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { telegramMessageId: null } });
  });

  it('does not post when only rating or comment changed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());

    await service.updateDay('2026-08-01', { rating: 9 });

    expect(prisma.day.updateMany).not.toHaveBeenCalled();
    expect(telegram.postDaySummary).not.toHaveBeenCalled();
  });

  it('does not post when the day is being reopened', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow({ eveningClosed: true }));

    await service.updateDay('2026-08-01', { eveningClosed: false });

    expect(prisma.day.updateMany).not.toHaveBeenCalled();
    expect(telegram.postDaySummary).not.toHaveBeenCalled();
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new DaysService(prisma, {} as any, {} as any, { postDaySummary: jest.fn().mockResolvedValue(null) } as any, {} as any);
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
    service = new DaysService(prisma, {} as any, {} as any, {} as any, {} as any);
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

describe('DaysService.setPomodoros', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          date: new Date('2026-08-04T00:00:00.000Z'),
          youtubeMinutes: 0,
          pomodoros: 7,
          eveningClosed: false,
          rating: null,
          comment: null,
          categories: [],
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
    );
  });

  it('writes an absolute value regardless of the previous count', async () => {
    await service.setPomodoros('2026-08-04', 3);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { pomodoros: 3 } });
  });

  it('clamps a negative count to zero', async () => {
    await service.setPomodoros('2026-08-04', -1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { pomodoros: 0 } });
  });
});

describe('DaysService.postWeeklySummary', () => {
  let prisma: any;
  let telegram: any;
  let stats: any;
  let service: DaysService;

  const weekStats = {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [],
    totalPomodoros: 10,
    avgPomodoros: 1.4,
    bestDay: null,
    avgRating: null,
    ratedDays: 0,
    categories: [],
    youtubeAvgMinutes: 0,
    youtubeBudget: 60,
  };

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    telegram = { postWeeklySummary: jest.fn().mockResolvedValue(42) };
    stats = { weekStats: jest.fn().mockResolvedValue(weekStats) };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      telegram,
      stats,
    );
  });

  it('claims the row and posts once', async () => {
    const result = await service.postWeeklySummary('2026-08-02', 'AAAA');

    expect(prisma.day.updateMany).toHaveBeenCalledWith({
      where: { id: 1, weeklyTelegramMessageId: null },
      data: { weeklyTelegramMessageId: 0 },
    });
    expect(telegram.postWeeklySummary).toHaveBeenCalledTimes(1);
    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { weeklyTelegramMessageId: 42 },
    });
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('does not post twice for the same week', async () => {
    prisma.day.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.postWeeklySummary('2026-08-02', 'AAAA');

    expect(telegram.postWeeklySummary).not.toHaveBeenCalled();
    expect(result).toEqual({ posted: false, withChart: false, reason: 'already-posted' });
  });

  it('releases the claim when sending fails', async () => {
    telegram.postWeeklySummary.mockResolvedValue(null);

    const result = await service.postWeeklySummary('2026-08-02', 'AAAA');

    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { weeklyTelegramMessageId: null },
    });
    expect(result).toEqual({ posted: false, withChart: true, reason: 'send-failed' });
  });

  it('reports withChart false when no image was supplied', async () => {
    const result = await service.postWeeklySummary('2026-08-02', null);

    expect(telegram.postWeeklySummary).toHaveBeenCalledWith(expect.any(String), null);
    expect(result).toEqual({ posted: true, withChart: false });
  });
});
