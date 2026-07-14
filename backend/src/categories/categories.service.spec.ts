import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      category: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    service = new CategoriesService(prisma);
  });

  it('assigns the next order on create', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.aggregate.mockResolvedValue({ _max: { order: 3 } });
    prisma.category.create.mockResolvedValue({ id: 1, key: 'reading', label: 'Чтение', order: 4, archived: false });

    await service.create({ key: 'reading', label: 'Чтение' });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { key: 'reading', label: 'Чтение', order: 4 },
    });
  });

  it('throws ConflictException when the key already exists', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 1, key: 'sport' });

    await expect(service.create({ key: 'sport', label: 'Спорт' })).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when updating an unknown category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.update('ghost', { label: 'x' })).rejects.toThrow(NotFoundException);
  });
});
