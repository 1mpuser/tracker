import { GtdService } from './gtd.service';

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
