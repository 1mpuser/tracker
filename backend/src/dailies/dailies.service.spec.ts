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
