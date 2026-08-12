import { NotFoundException } from '@nestjs/common';
import { RoutinesService } from './routines.service';

function makeService() {
  const prisma: any = {
    routine: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    routineLog: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    dayCategoryStatus: { upsert: jest.fn() },
  };
  const days: any = { getOrCreateDayId: jest.fn() };
  return { service: new RoutinesService(prisma, days), prisma, days };
}

describe('RoutinesService.getWeek', () => {
  it('берёт неделю пн–вс, содержащую переданную дату', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    const view = await service.getWeek('2026-08-16'); // воскресенье

    expect(view.weekStart).toBe('2026-08-10');
    expect(view.weekEnd).toBe('2026-08-16');
    const where = prisma.routine.findMany.mock.calls[0][0].include.logs.where;
    expect(where.date.gte.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(where.date.lte.toISOString()).toBe('2026-08-16T00:00:00.000Z');
  });

  it('считает done по логам недели и отдаёт дни строками', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Позаниматься в качалке', weeklyGoal: 3, categoryId: 5, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z') },
          { date: new Date('2026-08-12T00:00:00.000Z') },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].done).toBe(2);
    expect(view.routines[0].days).toEqual(['2026-08-10', '2026-08-12']);
    expect(view.routines[0].weeklyGoal).toBe(3);
    expect(view.routines[0].categoryId).toBe(5);
  });

  it('не показывает архивные рутины', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    await service.getWeek('2026-08-12');

    expect(prisma.routine.findMany.mock.calls[0][0].where).toEqual({ archived: false });
  });
});

describe('RoutinesService.create', () => {
  it('ставит норму 3 по умолчанию и следующий order', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: 4 } });
    prisma.routine.create.mockResolvedValue({ id: 1 });

    await service.create({ title: 'Растяжка' });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Растяжка', weeklyGoal: 3, categoryId: null, order: 5 },
    });
  });

  it('уважает переданные норму и сферу', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.routine.create.mockResolvedValue({ id: 2 });

    await service.create({ title: 'Позаниматься в качалке', weeklyGoal: 3, categoryId: 1 });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Позаниматься в качалке', weeklyGoal: 3, categoryId: 1, order: 0 },
    });
  });
});

describe('RoutinesService.update', () => {
  it('падает NotFound на несуществующей рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue(null);

    await expect(service.update(7, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routine.update).not.toHaveBeenCalled();
  });

  it('обновляет только переданные поля', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 1 });

    await service.update(1, { weeklyGoal: 2 });

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { weeklyGoal: 2 } });
  });
});

describe('RoutinesService.archive', () => {
  it('архивирует, а не удаляет', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 3, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 3 });

    const res = await service.archive(3);

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { archived: true } });
    expect(res).toEqual({ id: 3 });
  });

  it('падает NotFound на несуществующей рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue(null);

    await expect(service.archive(9)).rejects.toBeInstanceOf(NotFoundException);
  });
});
