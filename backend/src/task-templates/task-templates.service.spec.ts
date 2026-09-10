import { NotFoundException } from '@nestjs/common';
import { TaskTemplatesService } from './task-templates.service';

describe('TaskTemplatesService', () => {
  let service: TaskTemplatesService;
  let prisma: any;
  const userId = 1;

  beforeEach(() => {
    prisma = {
      taskTemplate: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TaskTemplatesService(prisma);
  });

  it('assigns the next order on create', async () => {
    prisma.taskTemplate.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prisma.taskTemplate.create.mockResolvedValue({ id: 1, userId, text: 'Тренировка', order: 1 });

    await service.create(userId, { text: 'Тренировка' });

    expect(prisma.taskTemplate.aggregate).toHaveBeenCalledWith({ where: { userId }, _max: { order: true } });
    expect(prisma.taskTemplate.create).toHaveBeenCalledWith({
      data: { userId, text: 'Тренировка', order: 1 },
    });
  });

  it('throws NotFoundException when updating a missing template', async () => {
    prisma.taskTemplate.findFirst.mockResolvedValue(null);

    await expect(service.update(userId, 999, { text: 'x' })).rejects.toThrow(NotFoundException);
    expect(prisma.taskTemplate.findFirst).toHaveBeenCalledWith({ where: { id: 999, userId } });
  });

  it('throws NotFoundException when removing a missing template', async () => {
    prisma.taskTemplate.findFirst.mockResolvedValue(null);

    await expect(service.remove(userId, 999)).rejects.toThrow(NotFoundException);
  });

  it('scopes findAll to the user', async () => {
    prisma.taskTemplate.findMany = jest.fn().mockResolvedValue([]);

    await service.findAll(userId);

    expect(prisma.taskTemplate.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { order: 'asc' },
    });
  });
});
