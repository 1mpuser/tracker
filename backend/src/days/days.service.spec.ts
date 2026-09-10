import { BadRequestException } from '@nestjs/common';
import { DaysService } from './days.service';

describe('DaysService.getDay', () => {
  const userId = 1;
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
      distractionMinutes: 0,
      pomodoros: 2,
      eveningClosed: false,
      rating: null,
      comment: null,
      categories: [],
    });

    const result = await service.getDay(userId, '2026-07-15');

    expect(result.pomodoros).toBe(2);
  });

  it('returns today\'s gtd slice from getForDate', async () => {
    prisma.day.findUnique.mockResolvedValue({
      date: new Date('2026-07-15T00:00:00.000Z'),
      distractionMinutes: 0, pomodoros: 0, eveningClosed: false, rating: null, comment: null,
      categories: [],
    });
    gtdService.getForDate.mockResolvedValue([{ id: 9, title: 'Из бэклога', status: 'backlog', plannedDate: '2026-07-15' }]);

    const result = await service.getDay(userId, '2026-07-15');

    expect(gtdService.getForDate).toHaveBeenCalledWith(userId, '2026-07-15');
    expect(result.today).toEqual([{ id: 9, title: 'Из бэклога', status: 'backlog', plannedDate: '2026-07-15' }]);
    expect((result as any).dailies).toBeUndefined();
  });
});

describe('DaysService.getHistory', () => {
  const userId = 1;
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
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.completed).toBe(0);
    expect(entry.total).toBe(2);
  });

  it('still counts an archived category toward total on a day it has a tracked status', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([
      {
        date: today,
        distractionMinutes: 10,
        categories: [{ categoryId: 3, done: true }],
      },
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 3, key: 'old', archived: true },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.total).toBe(2);
    expect(entry.completed).toBe(1);
  });

  it('excludes an archived category from days where it was never tracked', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([
      { id: 1, key: 'sport', archived: false },
      { id: 3, key: 'old', archived: true },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.total).toBe(1);
  });

  it('flags distractionOver when minutes exceed the current budget', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([
      { date: today, distractionMinutes: 90, categories: [] },
    ]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.distractionOver).toBe(true);
  });

  it('exposes the day row\'s rating', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([{ date: today, distractionMinutes: 0, rating: 7, categories: [] }]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.rating).toBe(7);
  });

  it('defaults rating to null when there is no history record for the day', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.rating).toBeNull();
  });

  it('anchors the range on the real clock when no end date is given', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.date).toBe('2026-07-15');
  });

  it('anchors the range on the given end date instead of the real clock', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1, '2026-07-20');

    expect(entry.date).toBe('2026-07-20');
  });

  it('exposes the day row\'s pomodoro count, defaulting to 0', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([{ date: today, distractionMinutes: 0, pomodoros: 6, categories: [] }]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ distractionBudget: 60 });

    const [entry] = await service.getHistory(userId, 1);

    expect(entry.pomodoros).toBe(6);
  });
});

describe('DaysService.updateDay telegram posting', () => {
  const userId = 1;
  let service: DaysService;
  let prisma: any;
  let delivery: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    delivery = { deliverDay: jest.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: 0 }), deliverWeek: jest.fn() };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      delivery,
      {} as any,
    );
  });

  // getOrCreateDayId() и getDay() внутри updateDay() тоже ходят в findUnique —
  // возвращаем одну и ту же строку дня на все вызовы.
  function dayRow(overrides: any = {}) {
    return {
      id: 1,
      date: new Date('2026-08-01T00:00:00.000Z'),
      distractionMinutes: 0,
      pomodoros: 7,
      eveningClosed: false,
      rating: 8,
      comment: null,
      telegramMessageId: null,
      categories: [],
      ...overrides,
    };
  }

  it('delivers the day summary when the day is closed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());

    await service.updateDay(userId, '2026-08-01', { eveningClosed: true });

    expect(delivery.deliverDay).toHaveBeenCalledTimes(1);
    expect(delivery.deliverDay.mock.calls[0][0]).toBe(1);
    expect(delivery.deliverDay.mock.calls[0][2]).toMatchObject({ date: '2026-08-01', pomodoros: 7 });
  });

  it('does not deliver when the day is reopened', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow({ eveningClosed: true }));

    await service.updateDay(userId, '2026-08-01', { eveningClosed: false });

    expect(delivery.deliverDay).not.toHaveBeenCalled();
  });

  it('does not deliver when only rating or comment changed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());

    await service.updateDay(userId, '2026-08-01', { rating: 9 });

    expect(delivery.deliverDay).not.toHaveBeenCalled();
  });
});

describe('DaysService.updateDay', () => {
  const userId = 1;
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new DaysService(prisma, {} as any, {} as any, { deliverDay: jest.fn() } as any, {} as any);
  });

  it('forwards only the provided fields to the Prisma update, not a merged full-day object', async () => {
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);

    await service.updateDay(userId, '2026-07-14', { rating: 8 });

    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { rating: 8 } });
  });

  it('supports updating multiple fields in one call', async () => {
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);

    await service.updateDay(userId, '2026-07-14', { eveningClosed: true, comment: 'Хороший день' });

    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { eveningClosed: true, comment: 'Хороший день' },
    });
  });
});

describe('DaysService.updatePomodoros', () => {
  const userId = 1;
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
    await service.updatePomodoros(userId, '2026-07-18', 1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 4 } });
  });

  it('clamps the count at zero on a negative delta', async () => {
    prisma.day.findUniqueOrThrow.mockResolvedValue({ id: 5, pomodoros: 0 });
    await service.updatePomodoros(userId, '2026-07-18', -1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 0 } });
  });

  it('resets the count to zero when reset is true', async () => {
    await service.updatePomodoros(userId, '2026-07-18', undefined, true);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 0 } });
  });
});

describe('DaysService.setPomodoros', () => {
  const userId = 1;
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          date: new Date('2026-08-04T00:00:00.000Z'),
          distractionMinutes: 0,
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
    await service.setPomodoros(userId, '2026-08-04', 3);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { pomodoros: 3 } });
  });

  it('clamps a negative count to zero', async () => {
    await service.setPomodoros(userId, '2026-08-04', -1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { pomodoros: 0 } });
  });
});

describe('DaysService.postWeeklySummary', () => {
  const userId = 1;
  let prisma: any;
  let delivery: any;
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
    distractionAvgMinutes: 0,
    distractionBudget: 60,
    distractionLabel: 'Залипание',
  };

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, eveningClosed: true }),
      },
    };
    delivery = { deliverWeek: jest.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: 0 }) };
    stats = { weekStats: jest.fn().mockResolvedValue(weekStats) };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      delivery,
      stats,
    );
  });

  it('reports posted when at least one chat received the summary', async () => {
    const result = await service.postWeeklySummary(userId, '2026-08-02', 'AAAA');

    expect(delivery.deliverWeek).toHaveBeenCalledTimes(1);
    expect(delivery.deliverWeek.mock.calls[0][0]).toBe(1);
    expect(delivery.deliverWeek.mock.calls[0][2]).toContain('📊 Неделя');
    expect(delivery.deliverWeek.mock.calls[0][3]).toBe('AAAA');
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('reports send-failed when attempts were made and all failed', async () => {
    delivery.deliverWeek.mockResolvedValue({ sent: 0, failed: 2, skipped: 0 });

    const result = await service.postWeeklySummary(userId, '2026-08-02', 'AAAA');

    expect(result).toEqual({ posted: false, withChart: true, reason: 'send-failed' });
  });

  it('reports already-posted when every chat already got this week', async () => {
    delivery.deliverWeek.mockResolvedValue({ sent: 0, failed: 0, skipped: 2 });

    const result = await service.postWeeklySummary(userId, '2026-08-02', 'AAAA');

    expect(result).toEqual({ posted: false, withChart: false, reason: 'already-posted' });
  });

  it('reports withChart false when no image was supplied', async () => {
    const result = await service.postWeeklySummary(userId, '2026-08-02', null);

    expect(delivery.deliverWeek.mock.calls[0][3]).toBeNull();
    expect(result).toEqual({ posted: true, withChart: false });
  });

  it('rejects a day that was never closed, without creating a row or delivering', async () => {
    prisma.day.findUnique.mockResolvedValue(null);

    await expect(service.postWeeklySummary(userId, '2026-08-02', 'AAAA')).rejects.toThrow(BadRequestException);

    expect(delivery.deliverWeek).not.toHaveBeenCalled();
  });

  it('rejects a day that exists but is not evening-closed', async () => {
    prisma.day.findUnique.mockResolvedValue({ id: 1, eveningClosed: false });

    await expect(service.postWeeklySummary(userId, '2026-08-02', 'AAAA')).rejects.toThrow(BadRequestException);

    expect(delivery.deliverWeek).not.toHaveBeenCalled();
  });

  it('reads week stats before delivering the summary', async () => {
    const calls: string[] = [];
    stats.weekStats.mockImplementation(async () => {
      calls.push('weekStats');
      return weekStats;
    });
    delivery.deliverWeek.mockImplementation(async () => {
      calls.push('deliverWeek');
      return { sent: 1, failed: 0, skipped: 0 };
    });

    await service.postWeeklySummary(userId, '2026-08-02', 'AAAA');

    expect(calls).toEqual(['weekStats', 'deliverWeek']);
  });

  it('never delivers when weekStats throws', async () => {
    stats.weekStats.mockRejectedValue(new Error('db is down'));

    await expect(service.postWeeklySummary(userId, '2026-08-02', 'AAAA')).rejects.toThrow('db is down');

    expect(delivery.deliverWeek).not.toHaveBeenCalled();
  });
});
