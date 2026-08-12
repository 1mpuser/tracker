import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DaysService } from '../days/days.service';
import { addDays, formatDate, mondayOf, parseDateParam, todayDate } from '../common/date.util';

export interface RoutineView {
  id: number;
  title: string;
  weeklyGoal: number;
  categoryId: number | null;
  done: number;
  days: string[];
  order: number;
}

export interface RoutinesWeekView {
  weekStart: string;
  weekEnd: string;
  routines: RoutineView[];
}

export interface RoutineHistoryWeek {
  weekStart: string;
  items: { routineId: number; done: number; weeklyGoal: number }[];
}

@Injectable()
export class RoutinesService {
  constructor(
    private prisma: PrismaService,
    private days: DaysService,
  ) {}

  async getWeek(weekParam?: string): Promise<RoutinesWeekView> {
    const anchor = weekParam ? parseDateParam(weekParam) : todayDate();
    const weekStart = mondayOf(anchor);
    const weekEnd = addDays(weekStart, 6);

    const routines = await this.prisma.routine.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
      include: {
        logs: { where: { date: { gte: weekStart, lte: weekEnd } }, orderBy: { date: 'asc' } },
      },
    });

    return {
      weekStart: formatDate(weekStart),
      weekEnd: formatDate(weekEnd),
      routines: routines.map((r: any) => ({
        id: r.id,
        title: r.title,
        weeklyGoal: r.weeklyGoal,
        categoryId: r.categoryId,
        done: r.logs.length,
        days: r.logs.map((l: any) => formatDate(l.date)),
        order: r.order,
      })),
    };
  }

  async create(dto: { title: string; weeklyGoal?: number; categoryId?: number | null }) {
    const maxOrder = await this.prisma.routine.aggregate({ _max: { order: true } });
    return this.prisma.routine.create({
      data: {
        title: dto.title,
        weeklyGoal: dto.weeklyGoal ?? 3,
        categoryId: dto.categoryId ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async update(
    id: number,
    dto: { title?: string; weeklyGoal?: number; categoryId?: number | null; archived?: boolean },
  ) {
    const existing = await this.prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.weeklyGoal !== undefined) data.weeklyGoal = dto.weeklyGoal;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.archived !== undefined) data.archived = dto.archived;
    return this.prisma.routine.update({ where: { id }, data });
  }

  // Жёсткого удаления нет намеренно: логи — самое ценное здесь,
  // а каскад унёс бы историю выполнения вместе с рутиной.
  async archive(id: number): Promise<{ id: number }> {
    const existing = await this.prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    await this.prisma.routine.update({ where: { id }, data: { archived: true } });
    return { id };
  }

  async addLog(id: number, dateStr: string): Promise<RoutinesWeekView> {
    const routine = await this.prisma.routine.findUnique({ where: { id } });
    if (!routine || routine.archived) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    const date = parseDateParam(dateStr);
    await this.prisma.routineLog.upsert({
      where: { routineId_date: { routineId: id, date } },
      update: {},
      create: { routineId: id, date },
    });

    if (routine.categoryId !== null) {
      const dayId = await this.days.getOrCreateDayId(dateStr);
      await this.prisma.dayCategoryStatus.upsert({
        where: { dayId_categoryId: { dayId, categoryId: routine.categoryId } },
        update: { done: true },
        create: { dayId, categoryId: routine.categoryId, done: true },
      });
    }

    return this.getWeek(dateStr);
  }

  // Галочку сферы намеренно не снимаем: сферу могли закрыть и по другой
  // причине (пробежка вместо качалки), и снятие отметки рутины не даёт
  // системе права стирать этот факт.
  async removeLog(id: number, dateStr: string): Promise<RoutinesWeekView> {
    const routine = await this.prisma.routine.findUnique({ where: { id } });
    if (!routine || routine.archived) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    const date = parseDateParam(dateStr);
    await this.prisma.routineLog.deleteMany({ where: { routineId: id, date } });
    return this.getWeek(dateStr);
  }

  /** Вынесено отдельным методом, чтобы тесты могли зафиксировать «сегодня». */
  private currentMonday(): Date {
    return mondayOf(todayDate());
  }

  /**
   * `anchor` — дата, от которой считается последняя неделя истории. Фронт шлёт
   * своё локальное «сегодня»: без якоря последняя неделя бралась бы от UTC-даты
   * сервера, и в ночные часы история разъезжалась бы с показанной неделей.
   */
  async getHistory(weeks = 8, anchor?: string): Promise<RoutineHistoryWeek[]> {
    // Число недель приходит из строки запроса: дробное или мусорное значение
    // ушло бы в границы диапазона дат и уронило бы запрос к базе.
    const count = Math.min(52, Math.max(1, Math.trunc(Number(weeks)) || 8));
    const lastMonday = anchor ? mondayOf(parseDateParam(anchor)) : this.currentMonday();
    const firstMonday = addDays(lastMonday, -(count - 1) * 7);

    const routines = await this.prisma.routine.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });
    const logs = await this.prisma.routineLog.findMany({
      where: {
        date: { gte: firstMonday, lte: addDays(lastMonday, 6) },
        routineId: { in: routines.map((r: any) => r.id) },
      },
    });

    const counts = new Map<string, number>();
    for (const log of logs as any[]) {
      const key = `${log.routineId}|${formatDate(mondayOf(log.date))}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result: RoutineHistoryWeek[] = [];
    for (let w = 0; w < count; w++) {
      const weekStart = formatDate(addDays(firstMonday, w * 7));
      result.push({
        weekStart,
        items: routines.map((r: any) => ({
          routineId: r.id,
          done: counts.get(`${r.id}|${weekStart}`) ?? 0,
          weeklyGoal: r.weeklyGoal,
        })),
      });
    }
    return result;
  }
}
