import { IntegrationsController } from './integrations.controller';

const user = { id: 1, email: 'a@b.c', timezone: 'UTC' };

function makeController() {
  const prisma = { gtdItem: { findMany: jest.fn() } };
  const integrations = {};
  const icloud = { syncAllOnStartup: jest.fn() };
  const controller = new IntegrationsController(integrations as any, icloud as any, prisma as any);
  return { controller, prisma, icloud } as { controller: IntegrationsController; prisma: any; icloud: any };
}

describe('IntegrationsController.resyncICloud', () => {
  it('приводит даты к строкам, исключает done/archived и возвращает честное число отправленных', async () => {
    const { controller, prisma, icloud } = makeController();
    // done/archived отсекает сам SQL-запрос (notIn), поэтому в результате их нет.
    prisma.gtdItem.findMany.mockResolvedValue([
      { id: 1, title: 'С дедлайном', status: 'backlog', dueDate: new Date('2026-09-01T00:00:00.000Z'), scheduledDate: null, scheduledTime: null, priority: false },
      { id: 4, title: 'На календарь', status: 'calendar', dueDate: null, scheduledDate: new Date('2026-09-04T00:00:00.000Z'), scheduledTime: '10:00', priority: true },
      { id: 5, title: 'Без срока', status: 'backlog', dueDate: null, scheduledDate: null, scheduledTime: null, priority: false },
    ]);

    const result = await controller.resyncICloud(user);

    expect(prisma.gtdItem.findMany).toHaveBeenCalledWith({
      where: { userId: 1, status: { notIn: ['done', 'archived'] } },
    });
    // Отправлены только те, у кого есть эффективная дата; даты — строки, а не Date.
    expect(icloud.syncAllOnStartup).toHaveBeenCalledWith(user, [
      expect.objectContaining({ id: 1, dueDate: '2026-09-01' }),
      expect.objectContaining({ id: 4, scheduledDate: '2026-09-04', scheduledTime: '10:00', priority: true }),
    ]);
    expect(icloud.syncAllOnStartup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ synced: 2 });
  });

  it('при пустом списке синк не вызывается, число честное — 0', async () => {
    const { controller, prisma, icloud } = makeController();
    prisma.gtdItem.findMany.mockResolvedValue([]);

    await expect(controller.resyncICloud(user)).resolves.toEqual({ synced: 0 });
    expect(icloud.syncAllOnStartup).not.toHaveBeenCalled();
  });
});
