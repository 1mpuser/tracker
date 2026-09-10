import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;
  const userId = 1;

  beforeEach(() => {
    prisma = {
      category: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new CategoriesService(prisma);
  });

  it('assigns the next order on create', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.aggregate.mockResolvedValue({ _max: { order: 3 } });
    prisma.category.create.mockResolvedValue({ id: 1, userId, key: 'reading', label: 'Чтение', order: 4, archived: false });

    await service.create(userId, { key: 'reading', label: 'Чтение' });

    expect(prisma.category.aggregate).toHaveBeenCalledWith({ where: { userId }, _max: { order: true } });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { userId, key: 'reading', label: 'Чтение', order: 4 },
    });
  });

  it('throws ConflictException when the key already exists', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 1, key: 'sport' });

    await expect(service.create(userId, { key: 'sport', label: 'Спорт' })).rejects.toThrow(ConflictException);
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { userId_key: { userId, key: 'sport' } },
    });
  });

  it('throws NotFoundException when updating an unknown category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.update(userId, 'ghost', { label: 'x' })).rejects.toThrow(NotFoundException);
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { userId_key: { userId, key: 'ghost' } },
    });
  });

  it('findActive scopes to the user and excludes archived', async () => {
    prisma.category.findMany.mockResolvedValue([]);

    await service.findActive(userId);

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId, archived: false },
      orderBy: { order: 'asc' },
    });
  });
});
