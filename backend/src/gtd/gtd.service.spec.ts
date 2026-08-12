import { GtdService } from './gtd.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('GtdService.create', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { aggregate: jest.fn(), create: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
  });

  it('creates an inbox item with the next order', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: 4 } });
    prisma.gtdItem.create.mockResolvedValue({ id: 1 });

    await service.create('Позвонить в банк');

    expect(prisma.gtdItem.create).toHaveBeenCalledWith({
      data: { title: 'Позвонить в банк', status: 'inbox', order: 5, parentId: undefined, decidedAt: expect.any(Date) },
    });
  });

  it('creates a child item under a project', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.gtdItem.create.mockResolvedValue({ id: 2 });

    await service.create('Первый шаг', 7);

    expect(prisma.gtdItem.create).toHaveBeenCalledWith({
      data: { title: 'Первый шаг', status: 'inbox', order: 0, parentId: 7, decidedAt: expect.any(Date) },
    });
  });

  it('проставляет decidedAt, чтобы задача никогда не оставалась без даты решения', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prisma.gtdItem.create.mockResolvedValue({ id: 3 });

    await service.create('Что-то');

    expect(prisma.gtdItem.create.mock.calls[0][0].data.decidedAt).toBeInstanceOf(Date);
  });
});

describe('GtdService.getItems', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findMany: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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
        waitingFor: null, order: 0, completedAt: null, decidedAt: null, deferCount: 0,
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
        waitingFor: null, order: 0, completedAt: null, decidedAt: null, deferCount: 0,
      },
    ]);
  });
});

describe('GtdService.update', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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
        decidedAt: expect.any(Date),
      },
    });
  });

  it('проставляет decidedAt: постановка на дату — это решение о судьбе задачи', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: 2 } });
    prisma.gtdItem.create.mockResolvedValue({ id: 1 });

    await service.createForDate('Сделать презу', '2026-07-23');

    expect(prisma.gtdItem.create.mock.calls[0][0].data.decidedAt).toBeInstanceOf(Date);
  });
});

describe('GtdService.update plannedDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
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

describe('GtdService.update scheduledTime', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
  });

  it('sets scheduledTime from a valid string', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'calendar' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'calendar', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null, scheduledTime: '14:30',
    });

    const result = await service.update(1, { scheduledTime: '14:30' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.scheduledTime).toBe('14:30');
    expect(result.scheduledTime).toBe('14:30');
  });

  it('clears scheduledTime on empty string', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'calendar' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'calendar', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null, scheduledTime: null,
    });

    await service.update(1, { scheduledTime: '' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.scheduledTime).toBeNull();
  });
});

describe('GtdService.update acceptanceCriteria/discussWith', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
  });

  it('sets acceptanceCriteria and discussWith', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'project' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'project', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: 'Готово, когда деплой на проде', discussWith: 'Маша',
      order: 0, completedAt: null,
    });

    const result = await service.update(1, {
      acceptanceCriteria: 'Готово, когда деплой на проде',
      discussWith: 'Маша',
    });

    const data = prisma.gtdItem.update.mock.calls[0][0].data;
    expect(data.acceptanceCriteria).toBe('Готово, когда деплой на проде');
    expect(data.discussWith).toBe('Маша');
    expect(result.acceptanceCriteria).toBe('Готово, когда деплой на проде');
    expect(result.discussWith).toBe('Маша');
  });

  it('clears both fields on null', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'project' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'project', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null,
      order: 0, completedAt: null,
    });

    await service.update(1, { acceptanceCriteria: null, discussWith: null });

    const data = prisma.gtdItem.update.mock.calls[0][0].data;
    expect(data.acceptanceCriteria).toBeNull();
    expect(data.discussWith).toBeNull();
  });
});

describe('GtdService reference -> obsidian', () => {
  let service: GtdService;
  let prisma: any;
  let obsidian: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() } };
    obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn(), syncAllOnStartup: jest.fn() };
    service = new GtdService(prisma, obsidian as any, icloud as any);
  });

  it('syncs a note when an item becomes reference', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'inbox' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 'Ссылка', notes: 'x', status: 'reference', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { status: 'reference' });

    expect(obsidian.syncNote).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'reference' }));
    expect(obsidian.removeNote).not.toHaveBeenCalled();
  });

  it('removes the note when an item leaves reference', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 2, status: 'reference' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 2, title: 'T', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(2, { status: 'backlog' });

    expect(obsidian.removeNote).toHaveBeenCalledWith(2);
    expect(obsidian.syncNote).not.toHaveBeenCalled();
  });

  it('removes the note when a reference item is deleted', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 3, status: 'reference' });
    prisma.gtdItem.delete.mockResolvedValue({ id: 3 });

    await service.remove(3);

    expect(obsidian.removeNote).toHaveBeenCalledWith(3);
  });
});

describe('GtdService reminders (effectiveDue-driven)', () => {
  let service: GtdService;
  let prisma: any;
  let obsidian: any;
  let icloud: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() } };
    obsidian = { syncNote: jest.fn(), removeNote: jest.fn() };
    icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn() };
    service = new GtdService(prisma, obsidian, icloud as any);
  });

  function row(overrides: Partial<any> = {}) {
    return {
      id: 1, title: 'T', notes: null, status: 'inbox', parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null,
      priority: false, waitingFor: null, order: 0, completedAt: null,
      ...overrides,
    };
  }

  it('syncs a reminder when a dueDate is set', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'backlog' }));
    prisma.gtdItem.update.mockResolvedValue(row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }));

    await service.update(1, { dueDate: '2026-08-01' });

    expect(icloud.syncReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, dueDate: '2026-08-01' }),
      { date: '2026-08-01', time: null },
    );
    expect(icloud.removeReminder).not.toHaveBeenCalled();
    expect(icloud.completeReminder).not.toHaveBeenCalled();
  });

  it('syncs a reminder when status becomes calendar with a scheduledDate', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'backlog' }));
    prisma.gtdItem.update.mockResolvedValue(
      row({ status: 'calendar', scheduledDate: new Date('2026-08-02T00:00:00.000Z'), scheduledTime: '10:00' }),
    );

    await service.update(1, { status: 'calendar', scheduledDate: '2026-08-02', scheduledTime: '10:00' });

    expect(icloud.syncReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status: 'calendar' }),
      { date: '2026-08-02', time: '10:00' },
    );
  });

  it('completes (not removes) the reminder when a due item transitions to done', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(
      row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    prisma.gtdItem.update.mockResolvedValue(
      row({ status: 'done', dueDate: new Date('2026-08-01T00:00:00.000Z'), completedAt: new Date() }),
    );

    await service.update(1, { status: 'done' });

    expect(icloud.completeReminder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'done' }),
      { date: '2026-08-01', time: null },
    );
    expect(icloud.removeReminder).not.toHaveBeenCalled();
    expect(icloud.syncReminder).not.toHaveBeenCalled();
  });

  it('removes the reminder when the effective due disappears (not done)', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(
      row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    prisma.gtdItem.update.mockResolvedValue(row({ status: 'backlog', dueDate: null }));

    await service.update(1, { dueDate: null });

    expect(icloud.removeReminder).toHaveBeenCalledWith(1);
    expect(icloud.syncReminder).not.toHaveBeenCalled();
    expect(icloud.completeReminder).not.toHaveBeenCalled();
  });

  it('removes the reminder on delete when the item had an effective due date', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(
      row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    prisma.gtdItem.delete.mockResolvedValue({ id: 1 });

    await service.remove(1);

    expect(icloud.removeReminder).toHaveBeenCalledWith(1);
  });

  it('removes the reminder on delete when the item was done (had a completed reminder)', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'done' }));
    prisma.gtdItem.delete.mockResolvedValue({ id: 1 });

    await service.remove(1);

    expect(icloud.removeReminder).toHaveBeenCalledWith(1);
  });

  it('does not touch icloud on delete for an item with no due and not done', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'someday' }));
    prisma.gtdItem.delete.mockResolvedValue({ id: 1 });

    await service.remove(1);

    expect(icloud.removeReminder).not.toHaveBeenCalled();
  });
});

describe('GtdService.update — decidedAt и deferCount', () => {
  let service: GtdService;
  let prisma: any;

  function existing(over: any = {}) {
    return {
      id: 1, title: 'Прибраться в квартире', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: 0, completedAt: null,
      decidedAt: new Date('2026-07-20T10:00:00Z'), deferCount: 0, ...over,
    };
  }

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = {
      syncReminder: jest.fn(), completeReminder: jest.fn(),
      removeReminder: jest.fn(), syncAllOnStartup: jest.fn(),
    };
    service = new GtdService(prisma, obsidian as any, icloud as any);
  });

  it('ставит decidedAt, когда в патче есть status', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing({ status: 'inbox' }));
    prisma.gtdItem.update.mockResolvedValue(existing({ status: 'backlog' }));

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.decidedAt).toBeInstanceOf(Date);
  });

  it('не трогает decidedAt и deferCount при правке заголовка', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing());
    prisma.gtdItem.update.mockResolvedValue(existing({ title: 'Новое' }));

    await service.update(1, { title: 'Новое' });

    const data = prisma.gtdItem.update.mock.calls[0][0].data;
    expect(data.decidedAt).toBeUndefined();
    expect(data.deferCount).toBeUndefined();
  });

  it('инкрементирует deferCount при повторном обещании backlog → backlog', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing({ status: 'backlog', deferCount: 2 }));
    prisma.gtdItem.update.mockResolvedValue(existing({ status: 'backlog', deferCount: 3 }));

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.deferCount).toBe(3);
  });

  it('не инкрементирует deferCount при переходе someday → backlog', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing({ status: 'someday', deferCount: 2 }));
    prisma.gtdItem.update.mockResolvedValue(existing({ status: 'backlog', deferCount: 2 }));

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.deferCount).toBeUndefined();
  });

  it('отдаёт decidedAt строкой ISO и deferCount числом', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing());
    prisma.gtdItem.update.mockResolvedValue(
      existing({ deferCount: 3, decidedAt: new Date('2026-08-01T09:00:00Z') }),
    );

    const view = await service.update(1, { title: 'x' });

    expect(view.decidedAt).toBe('2026-08-01T09:00:00.000Z');
    expect(view.deferCount).toBe(3);
  });

  it('отдаёт decidedAt как null, когда поле пустое', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing());
    prisma.gtdItem.update.mockResolvedValue(existing({ decidedAt: null }));

    const view = await service.update(1, { title: 'x' });

    expect(view.decidedAt).toBeNull();
  });
});
