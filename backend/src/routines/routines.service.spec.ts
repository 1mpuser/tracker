import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  it('считает done в закрытых днях, а не в отметках', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: null, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z'), count: 2 },
          { date: new Date('2026-08-11T00:00:00.000Z'), count: 1 },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].done).toBe(1);
    expect(view.routines[0].timesPerDay).toBe(2);
    expect(view.routines[0].daysPerWeek).toBe(7);
  });

  it('отдаёт дни с числом отметок', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: null, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z'), count: 2 },
          { date: new Date('2026-08-11T00:00:00.000Z'), count: 1 },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].days).toEqual([
      { date: '2026-08-10', count: 2 },
      { date: '2026-08-11', count: 1 },
    ]);
  });

  it('при дневной норме 1 каждая отметка закрывает день', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Качалка', timesPerDay: 1, daysPerWeek: 3, categoryId: null, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z'), count: 1 },
          { date: new Date('2026-08-12T00:00:00.000Z'), count: 1 },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].done).toBe(2);
  });

  it('не показывает архивные рутины', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    await service.getWeek('2026-08-12');

    expect(prisma.routine.findMany.mock.calls[0][0].where).toEqual({ archived: false });
  });
});

describe('RoutinesService.create', () => {
  it('ставит нормы по умолчанию и следующий order', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: 4 } });
    prisma.routine.create.mockResolvedValue({ id: 1 });

    await service.create({ title: 'Растяжка' });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Растяжка', timesPerDay: 1, daysPerWeek: 3, categoryId: null, order: 5 },
    });
  });

  it('уважает переданные нормы и сферу', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.routine.create.mockResolvedValue({ id: 2 });

    await service.create({ title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: 1 });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: 1, order: 0 },
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

    await service.update(1, { daysPerWeek: 5 });

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { daysPerWeek: 5 } });
  });

  it('позволяет менять дневную норму', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 1 });

    await service.update(1, { timesPerDay: 2 });

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { timesPerDay: 2 } });
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

describe('RoutinesService.setLog', () => {
  it('пишет абсолютное число отметок за день', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 2);

    expect(prisma.routineLog.upsert).toHaveBeenCalledWith({
      where: { routineId_date: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') } },
      update: { count: 2 },
      create: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z'), count: 2 },
    });
  });

  it('идемпотентен: повтор с тем же числом даёт тот же результат', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 1);
    await service.setLog(1, '2026-08-12', 1);

    expect(prisma.routineLog.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ update: { count: 1 } }));
  });

  it('ноль удаляет строку дня, а не пишет нулевой счётчик', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 0);

    expect(prisma.routineLog.deleteMany).toHaveBeenCalledWith({
      where: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') },
    });
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });

  it('отклоняет число больше дневной нормы', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });

    await expect(service.setLog(1, '2026-08-12', 3)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });

  it('ставит галочку сферы, когда день получает первую отметку', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: 5, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);
    days.getOrCreateDayId.mockResolvedValue(42);

    await service.setLog(1, '2026-08-12', 1);

    expect(prisma.dayCategoryStatus.upsert).toHaveBeenCalledWith({
      where: { dayId_categoryId: { dayId: 42, categoryId: 5 } },
      update: { done: true },
      create: { dayId: 42, categoryId: 5, done: true },
    });
  });

  // Единственный путь, который вообще пишет в DayCategoryStatus, — отметка
  // больше нуля. Без этого теста условие `categoryId !== null` не закреплено
  // ничем: сломавшись, оно даст запись с categoryId = null, то есть падение в
  // проде, а не тихую деградацию.
  it('не трогает сферы, когда привязки нет', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 1);

    expect(days.getOrCreateDayId).not.toHaveBeenCalled();
    expect(prisma.dayCategoryStatus.upsert).not.toHaveBeenCalled();
  });

  it('не трогает сферу, когда число обнуляют', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: 5, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 0);

    expect(days.getOrCreateDayId).not.toHaveBeenCalled();
    expect(prisma.dayCategoryStatus.upsert).not.toHaveBeenCalled();
  });

  it('падает NotFound на архивной рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: true, categoryId: null, timesPerDay: 1 });

    await expect(service.setLog(1, '2026-08-12', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });

  // Фронт присваивает ответ setLog прямо в состояние недели: если вернуть
  // не ту неделю, экран уедет на чужую семёрку дней сразу после отметки.
  it('возвращает неделю, содержащую отмеченную дату', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 1 });
    prisma.routine.findMany.mockResolvedValue([]);

    const view = await service.setLog(1, '2026-08-16', 1); // воскресенье

    expect(view.weekStart).toBe('2026-08-10');
    expect(view.weekEnd).toBe('2026-08-16');
  });
});

describe('RoutinesService.removeLog', () => {
  it('снимает отметку за конкретную дату', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.removeLog(1, '2026-08-12');

    expect(prisma.routineLog.deleteMany).toHaveBeenCalledWith({
      where: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') },
    });
  });

  it('не снимает галочку сферы — сферу могли закрыть по другой причине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: 5 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.removeLog(1, '2026-08-12');

    expect(prisma.dayCategoryStatus.upsert).not.toHaveBeenCalled();
  });

  it('не падает, когда отметки не было', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null });
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeLog(1, '2026-08-12')).resolves.toBeDefined();
  });

  it('падает NotFound на несуществующей рутине — как и addLog', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue(null);

    await expect(service.removeLog(1, '2026-08-12')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routineLog.deleteMany).not.toHaveBeenCalled();
  });

  it('падает NotFound на архивной рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: true, categoryId: null });

    await expect(service.removeLog(1, '2026-08-12')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routineLog.deleteMany).not.toHaveBeenCalled();
  });
});

describe('RoutinesService.getHistory', () => {
  it('возвращает запрошенное число недель, последняя — текущая', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, timesPerDay: 1, daysPerWeek: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(3);

    expect(history.map((w) => w.weekStart)).toEqual(['2026-07-27', '2026-08-03', '2026-08-10']);
  });

  it('раскладывает логи по неделям и считает закрытые дни', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, timesPerDay: 2, daysPerWeek: 7 }]);
    prisma.routineLog.findMany.mockResolvedValue([
      { routineId: 1, date: new Date('2026-08-11T00:00:00.000Z'), count: 2 },
      { routineId: 1, date: new Date('2026-08-13T00:00:00.000Z'), count: 1 },
      { routineId: 1, date: new Date('2026-08-05T00:00:00.000Z'), count: 2 },
    ]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(2);

    expect(history[0]).toEqual({ weekStart: '2026-08-03', items: [{ routineId: 1, done: 1, daysPerWeek: 7 }] });
    expect(history[1]).toEqual({ weekStart: '2026-08-10', items: [{ routineId: 1, done: 1, daysPerWeek: 7 }] });
  });

  it('отдаёт нули для недели без отметок, а не пропускает её', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, timesPerDay: 1, daysPerWeek: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(2);

    expect(history[0].items).toEqual([{ routineId: 1, done: 0, daysPerWeek: 3 }]);
  });

  it('не считает архивные рутины', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    await service.getHistory(2);

    expect(prisma.routine.findMany.mock.calls[0][0].where).toEqual({ archived: false });
  });

  it('с якорем последняя неделя определяется по нему, а не по текущему понедельнику', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, timesPerDay: 1, daysPerWeek: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-03T00:00:00.000Z'));

    const history = await service.getHistory(2, '2026-08-16'); // воскресенье недели с 10.08

    expect(history.map((w) => w.weekStart)).toEqual(['2026-08-03', '2026-08-10']);
  });

  it('без якоря последняя неделя — текущий понедельник', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, timesPerDay: 1, daysPerWeek: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-03T00:00:00.000Z'));

    const history = await service.getHistory(2);

    expect(history.map((w) => w.weekStart)).toEqual(['2026-07-27', '2026-08-03']);
  });

  it('не путает рутины между собой внутри одной недели', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      { id: 1, timesPerDay: 1, daysPerWeek: 3 },
      { id: 2, timesPerDay: 1, daysPerWeek: 2 },
    ]);
    prisma.routineLog.findMany.mockResolvedValue([
      { routineId: 1, date: new Date('2026-08-10T00:00:00.000Z'), count: 1 },
      { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z'), count: 1 },
      { routineId: 2, date: new Date('2026-08-12T00:00:00.000Z'), count: 1 },
      { routineId: 2, date: new Date('2026-08-05T00:00:00.000Z'), count: 1 },
    ]);

    const history = await service.getHistory(2, '2026-08-12');

    expect(history[1]).toEqual({
      weekStart: '2026-08-10',
      items: [
        { routineId: 1, done: 2, daysPerWeek: 3 },
        { routineId: 2, done: 1, daysPerWeek: 2 },
      ],
    });
    expect(history[0]).toEqual({
      weekStart: '2026-08-03',
      items: [
        { routineId: 1, done: 0, daysPerWeek: 3 },
        { routineId: 2, done: 1, daysPerWeek: 2 },
      ],
    });
  });

  it('приводит мусорное число недель к значению по умолчанию', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.findMany.mockResolvedValue([]);

    const history = await service.getHistory(Number('abc'), '2026-08-12');

    expect(history).toHaveLength(8);
    expect(history[7].weekStart).toBe('2026-08-10');
  });

  it('ограничивает число недель сверху и снизу', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.findMany.mockResolvedValue([]);

    expect(await service.getHistory(1000, '2026-08-12')).toHaveLength(52);
    expect(await service.getHistory(-5, '2026-08-12')).toHaveLength(1);
    expect(await service.getHistory(2.7, '2026-08-12')).toHaveLength(2);
  });

  it('отклоняет якорь, который не является датой', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.findMany.mockResolvedValue([]);

    await expect(service.getHistory(2, 'вчера')).rejects.toBeInstanceOf(BadRequestException);
  });
});
