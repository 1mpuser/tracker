import { GtdService } from './gtd.service';
import { NotFoundException } from '@nestjs/common';

describe('GtdService.create', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { aggregate: jest.fn(), create: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('creates an inbox item with the next order', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: 4 } });
    prisma.gtdItem.create.mockResolvedValue({ id: 1 });

    await service.create('Позвонить в банк');

    expect(prisma.gtdItem.create).toHaveBeenCalledWith({
      data: { title: 'Позвонить в банк', status: 'inbox', order: 5, parentId: undefined },
    });
  });

  it('creates a child item under a project', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.gtdItem.create.mockResolvedValue({ id: 2 });

    await service.create('Первый шаг', 7);

    expect(prisma.gtdItem.create).toHaveBeenCalledWith({
      data: { title: 'Первый шаг', status: 'inbox', order: 0, parentId: 7 },
    });
  });
});

describe('GtdService.getItems', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findMany: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('excludes done and archived when no status filter is given', async () => {
    prisma.gtdItem.findMany.mockResolvedValue([]);

    await service.getItems();

    expect(prisma.gtdItem.findMany).toHaveBeenCalledWith({
      where: { status: { notIn: ['done', 'archived'] } },
      orderBy: { order: 'asc' },
    });
  });

  it('filters by the given status and serializes dates as strings', async () => {
    prisma.gtdItem.findMany.mockResolvedValue([
      {
        id: 3, title: 'Встреча', notes: null, status: 'calendar', parentId: null,
        scheduledDate: new Date('2026-07-25T00:00:00.000Z'), waitingFor: null,
        order: 0, completedAt: null,
      },
    ]);

    const result = await service.getItems('calendar');

    expect(prisma.gtdItem.findMany).toHaveBeenCalledWith({
      where: { status: 'calendar' },
      orderBy: { order: 'asc' },
    });
    expect(result).toEqual([
      {
        id: 3, title: 'Встреча', notes: null, status: 'calendar', parentId: null,
        scheduledDate: '2026-07-25', waitingFor: null, order: 0, completedAt: null,
      },
    ]);
  });
});

describe('GtdService.update', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('sets completedAt when moving to done', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'done', parentId: null,
      scheduledDate: null, waitingFor: null, order: 0, completedAt: new Date('2026-07-23T10:00:00.000Z'),
    });

    const result = await service.update(1, { status: 'done' });

    const arg = prisma.gtdItem.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1 });
    expect(arg.data.status).toBe('done');
    expect(arg.data.completedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBe('2026-07-23T10:00:00.000Z');
  });

  it('clears completedAt when moving away from done', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'done' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.completedAt).toBeNull();
  });

  it('converts scheduledDate string to a Date', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'inbox' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'calendar', parentId: null,
      scheduledDate: new Date('2026-07-30T00:00:00.000Z'), waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { status: 'calendar', scheduledDate: '2026-07-30' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.scheduledDate).toEqual(
      new Date('2026-07-30T00:00:00.000Z'),
    );
  });

  it('throws NotFoundException for a missing item', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(null);
    await expect(service.update(999, { title: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('GtdService.remove', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), delete: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('throws NotFoundException for a missing item', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(null);
    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing item', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 5 });
    prisma.gtdItem.delete.mockResolvedValue({ id: 5 });

    const result = await service.remove(5);

    expect(prisma.gtdItem.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(result).toEqual({ id: 5 });
  });
});
