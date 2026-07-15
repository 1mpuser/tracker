import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DaysService, DayView } from '../days/days.service';
import { addDays, formatDate, parseDateParam } from '../common/date.util';

export interface CarryCandidate {
  id: number;
  text: string;
  originDate: string;
}

@Injectable()
export class DailiesService {
  constructor(
    private prisma: PrismaService,
    private daysService: DaysService,
  ) {}

  async create(dateStr: string, text: string) {
    const dayId = await this.daysService.getOrCreateDayId(dateStr);
    const maxOrder = await this.prisma.dailyTask.aggregate({
      where: { dayId },
      _max: { order: true },
    });
    return this.prisma.dailyTask.create({
      data: { dayId, text, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async getCarryCandidates(dateStr: string, days: number): Promise<CarryCandidate[]> {
    const date = parseDateParam(dateStr);
    const rangeStart = addDays(date, -days);
    const rangeEnd = addDays(date, -1);

    const tasks = await this.prisma.dailyTask.findMany({
      where: {
        done: false,
        carriedForward: false,
        day: { date: { gte: rangeStart, lte: rangeEnd } },
      },
      include: { day: true },
      orderBy: { day: { date: 'desc' } },
    });

    return tasks.map((t) => ({
      id: t.id,
      text: t.text,
      originDate: formatDate(t.carriedFromDate ?? t.day.date),
    }));
  }

  async carryTasks(dateStr: string, ids: number[]): Promise<DayView> {
    const dayId = await this.daysService.getOrCreateDayId(dateStr);

    await this.prisma.$transaction(async (tx) => {
      const maxOrder = await tx.dailyTask.aggregate({ where: { dayId }, _max: { order: true } });
      let nextOrder = (maxOrder._max.order ?? -1) + 1;

      for (const id of ids) {
        const source = await tx.dailyTask.findUnique({ where: { id }, include: { day: true } });
        if (!source || source.done || source.carriedForward) continue;

        await tx.dailyTask.create({
          data: {
            dayId,
            text: source.text,
            order: nextOrder++,
            carriedFromDate: source.carriedFromDate ?? source.day.date,
          },
        });
        await tx.dailyTask.update({ where: { id: source.id }, data: { carriedForward: true } });
      }
    });

    return this.daysService.getDay(dateStr);
  }

  async update(id: number, data: { done?: boolean; text?: string }) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Daily task ${id} not found`);
    }
    return this.prisma.dailyTask.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Daily task ${id} not found`);
    }
    await this.prisma.dailyTask.delete({ where: { id } });
    return { id };
  }
}
