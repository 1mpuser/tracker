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
}
