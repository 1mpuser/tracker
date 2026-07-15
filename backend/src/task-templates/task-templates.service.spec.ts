import { NotFoundException } from '@nestjs/common';
import { TaskTemplatesService } from './task-templates.service';

describe('TaskTemplatesService', () => {
  let service: TaskTemplatesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      taskTemplate: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TaskTemplatesService(prisma);
  });

  it('assigns the next order on create', async () => {
    prisma.taskTemplate.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prisma.taskTemplate.create.mockResolvedValue({ id: 1, text: 'Тренировка', order: 1 });

    await service.create({ text: 'Тренировка' });

    expect(prisma.taskTemplate.create).toHaveBeenCalledWith({
      data: { text: 'Тренировка', order: 1 },
    });
  });

  it('throws NotFoundException when updating a missing template', async () => {
    prisma.taskTemplate.findUnique.mockResolvedValue(null);

    await expect(service.update(999, { text: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when removing a missing template', async () => {
    prisma.taskTemplate.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});
