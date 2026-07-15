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
