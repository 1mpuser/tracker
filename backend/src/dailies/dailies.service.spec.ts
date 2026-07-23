import { NotFoundException } from '@nestjs/common';
import { DailiesService } from './dailies.service';

describe('DailiesService', () => {
  let service: DailiesService;
  let prisma: any;
  let daysService: any;

  beforeEach(() => {
    prisma = {
      dailyTask: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    daysService = { getOrCreateDayId: jest.fn().mockResolvedValue(7) };
    service = new DailiesService(prisma, daysService);
  });

  it('assigns the next order within the day on create', async () => {
    prisma.dailyTask.aggregate.mockResolvedValue({ _max: { order: 1 } });
    prisma.dailyTask.create.mockResolvedValue({ id: 1, dayId: 7, text: 'Пробежка', done: false, order: 2 });

    await service.create('2026-07-15', 'Пробежка');

    expect(daysService.getOrCreateDayId).toHaveBeenCalledWith('2026-07-15');
    expect(prisma.dailyTask.create).toHaveBeenCalledWith({
      data: { dayId: 7, text: 'Пробежка', order: 2 },
    });
  });

  it('throws NotFoundException when updating a missing task', async () => {
    prisma.dailyTask.findUnique.mockResolvedValue(null);

    await expect(service.update(999, { done: true })).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when removing a missing task', async () => {
    prisma.dailyTask.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});

describe('DailiesService.getCarryCandidates', () => {
  let service: DailiesService;
  let prisma: any;

  beforeEach(() => {
    prisma = { dailyTask: { findMany: jest.fn() } };
    service = new DailiesService(prisma, {} as any);
  });

  it('queries the correct date range based on days before the target date', async () => {
    prisma.dailyTask.findMany.mockResolvedValue([]);

    await service.getCarryCandidates('2026-07-16', 3);

    expect(prisma.dailyTask.findMany).toHaveBeenCalledWith({
      where: {
        done: false,
        carriedForward: false,
        day: {
          date: {
            gte: new Date('2026-07-13T00:00:00.000Z'),
            lte: new Date('2026-07-15T00:00:00.000Z'),
          },
        },
      },
      include: { day: true },
      orderBy: { day: { date: 'desc' } },
    });
  });

  it('uses the day date as originDate when the task has never been carried before', async () => {
    prisma.dailyTask.findMany.mockResolvedValue([
      { id: 1, text: 'Позвонить в банк', carriedFromDate: null, day: { date: new Date('2026-07-15T00:00:00.000Z') } },
    ]);

    const result = await service.getCarryCandidates('2026-07-16', 3);

    expect(result).toEqual([{ id: 1, text: 'Позвонить в банк', originDate: '2026-07-15' }]);
  });

  it('uses carriedFromDate as originDate when the task was already carried once', async () => {
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 2,
        text: 'Разобрать почту',
        carriedFromDate: new Date('2026-07-10T00:00:00.000Z'),
        day: { date: new Date('2026-07-15T00:00:00.000Z') },
      },
    ]);

    const result = await service.getCarryCandidates('2026-07-16', 3);

    expect(result).toEqual([{ id: 2, text: 'Разобрать почту', originDate: '2026-07-10' }]);
  });
});

describe('DailiesService.carryTasks', () => {
  let service: DailiesService;
  let prisma: any;
  let daysService: any;

  beforeEach(() => {
    prisma = {
      dailyTask: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => Promise<void>) => callback(prisma)),
    };
    daysService = {
      getOrCreateDayId: jest.fn().mockResolvedValue(9),
      getDay: jest.fn().mockResolvedValue({ date: '2026-07-16' }),
    };
    service = new DailiesService(prisma, daysService);
  });

  it('creates a copy in the target day and marks the source task carried', async () => {
    prisma.dailyTask.aggregate.mockResolvedValue({ _max: { order: 2 } });
    prisma.dailyTask.findUnique.mockResolvedValue({
      id: 5,
      text: 'Позвонить в банк',
      done: false,
      carriedForward: false,
      carriedFromDate: null,
      day: { date: new Date('2026-07-13T00:00:00.000Z') },
    });

    await service.carryTasks('2026-07-16', [5]);

    expect(prisma.dailyTask.create).toHaveBeenCalledWith({
      data: {
        dayId: 9,
        text: 'Позвонить в банк',
        order: 3,
        carriedFromDate: new Date('2026-07-13T00:00:00.000Z'),
      },
    });
    expect(prisma.dailyTask.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { carriedForward: true },
    });
    expect(daysService.getDay).toHaveBeenCalledWith('2026-07-16');
  });

  it('propagates the earliest known origin date through a carry chain', async () => {
    prisma.dailyTask.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.dailyTask.findUnique.mockResolvedValue({
      id: 6,
      text: 'Разобрать почту',
      done: false,
      carriedForward: false,
      carriedFromDate: new Date('2026-07-10T00:00:00.000Z'),
      day: { date: new Date('2026-07-15T00:00:00.000Z') },
    });

    await service.carryTasks('2026-07-16', [6]);

    expect(prisma.dailyTask.create).toHaveBeenCalledWith({
      data: {
        dayId: 9,
        text: 'Разобрать почту',
        order: 0,
        carriedFromDate: new Date('2026-07-10T00:00:00.000Z'),
      },
    });
  });

  it('silently skips an id that is already done', async () => {
    prisma.dailyTask.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.dailyTask.findUnique.mockResolvedValue({
      id: 7,
      text: 'Старая задача',
      done: true,
      carriedForward: false,
      carriedFromDate: null,
      day: { date: new Date('2026-07-14T00:00:00.000Z') },
    });

    await service.carryTasks('2026-07-16', [7]);

    expect(prisma.dailyTask.create).not.toHaveBeenCalled();
    expect(prisma.dailyTask.update).not.toHaveBeenCalled();
  });

  it('silently skips an id that no longer exists', async () => {
    prisma.dailyTask.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.dailyTask.findUnique.mockResolvedValue(null);

    const result = await service.carryTasks('2026-07-16', [999]);

    expect(prisma.dailyTask.create).not.toHaveBeenCalled();
    expect(result).toEqual({ date: '2026-07-16' });
  });
});

describe('DailiesService.getAllTasks', () => {
  let service: DailiesService;
  let prisma: any;

  beforeEach(() => {
    prisma = { dailyTask: { findMany: jest.fn() } };
    service = new DailiesService(prisma, {} as any);
  });

  it('flattens every task with string dates, newest day first', async () => {
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 3,
        text: 'Созвон',
        done: false,
        order: 0,
        carriedForward: false,
        carriedFromDate: null,
        day: { date: new Date('2026-07-23T00:00:00.000Z') },
      },
      {
        id: 1,
        text: 'Почта',
        done: true,
        order: 1,
        carriedForward: false,
        carriedFromDate: new Date('2026-07-20T00:00:00.000Z'),
        day: { date: new Date('2026-07-21T00:00:00.000Z') },
      },
    ]);

    const result = await service.getAllTasks();

    expect(prisma.dailyTask.findMany).toHaveBeenCalledWith({
      include: { day: true },
      orderBy: [{ day: { date: 'desc' } }, { order: 'asc' }],
    });
    expect(result).toEqual([
      { id: 3, text: 'Созвон', done: false, date: '2026-07-23', carriedFromDate: null, carriedForward: false },
      { id: 1, text: 'Почта', done: true, date: '2026-07-21', carriedFromDate: '2026-07-20', carriedForward: false },
    ]);
  });
});
