import { GtdService } from './gtd.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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
        scheduledDate: new Date('2026-07-25T00:00:00.000Z'), plannedDate: null, dueDate: null, priority: false,
        waitingFor: null, order: 0, completedAt: null,
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
        scheduledDate: '2026-07-25', plannedDate: null, dueDate: null, priority: false,
        waitingFor: null, order: 0, completedAt: null,
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

  it('rejects an invalid calendar date (no silent rollover)', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'inbox' });
    await expect(service.update(1, { status: 'calendar', scheduledDate: '2026-02-30' })).rejects.toThrow(
      BadRequestException,
    );
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

describe('GtdService.getForDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findMany: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('queries planned-for-date OR calendar-scheduled-for-date, excluding archived', async () => {
    prisma.gtdItem.findMany.mockResolvedValue([]);

    await service.getForDate('2026-07-23');

    const date = new Date('2026-07-23T00:00:00.000Z');
    expect(prisma.gtdItem.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: 'archived' },
        OR: [{ plannedDate: date }, { status: 'calendar', scheduledDate: date }],
      },
      orderBy: { order: 'asc' },
    });
  });

  it('serializes plannedDate/scheduledDate as strings', async () => {
    prisma.gtdItem.findMany.mockResolvedValue([
      {
        id: 5, title: 'Задача', notes: null, status: 'backlog', parentId: null,
        scheduledDate: null, plannedDate: new Date('2026-07-23T00:00:00.000Z'),
        waitingFor: null, order: 0, completedAt: null,
      },
    ]);

    const result = await service.getForDate('2026-07-23');

    expect(result[0].plannedDate).toBe('2026-07-23');
  });
});

describe('GtdService.createForDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { aggregate: jest.fn(), create: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('creates a backlog item planned for the date', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: 2 } });
    prisma.gtdItem.create.mockResolvedValue({ id: 1 });

    await service.createForDate('Сделать презу', '2026-07-23');

    expect(prisma.gtdItem.create).toHaveBeenCalledWith({
      data: {
        title: 'Сделать презу',
        status: 'backlog',
        order: 3,
        plannedDate: new Date('2026-07-23T00:00:00.000Z'),
      },
    });
  });
});

describe('GtdService.update plannedDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('sets plannedDate from a valid string', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: new Date('2026-07-23T00:00:00.000Z'),
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { plannedDate: '2026-07-23' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.plannedDate).toEqual(
      new Date('2026-07-23T00:00:00.000Z'),
    );
  });

  it('clears plannedDate on null', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { plannedDate: null });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.plannedDate).toBeNull();
  });
});

describe('GtdService.update due/priority', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('sets dueDate via parseDateParam and priority', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: new Date('2026-07-30T00:00:00.000Z'),
      priority: true, waitingFor: null, order: 0, completedAt: null,
    });

    const result = await service.update(1, { dueDate: '2026-07-30', priority: true });

    const data = prisma.gtdItem.update.mock.calls[0][0].data;
    expect(data.dueDate).toEqual(new Date('2026-07-30T00:00:00.000Z'));
    expect(data.priority).toBe(true);
    expect(result.dueDate).toBe('2026-07-30');
    expect(result.priority).toBe(true);
  });

  it('clears dueDate on null', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { dueDate: null });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.dueDate).toBeNull();
  });
});
